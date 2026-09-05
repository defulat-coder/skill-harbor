//! In-memory chat session registry and running-process registry.
//!
//! Sessions are intentionally NOT persisted: a conversation handle lives only
//! for the app run. The process registry mirrors the `SearchProcesses`
//! pattern in `commands/skill_search.rs` — spawn holds the lock through
//! registration so shutdown cannot miss a just-started process, and cancel /
//! drop kills the whole process group.
use std::{
    collections::{BTreeSet, HashMap},
    process::Stdio,
    sync::{Arc, Mutex, OnceLock},
};

use crate::core::error::AppError;

#[derive(Clone)]
pub struct ChatSession {
    pub agent_id: String,
    /// CLI-native session handle (claude `--session-id` UUID, codex thread
    /// id, opencode `ses_...`, kimi session id). Present once known.
    pub native_session_id: Option<String>,
    pub model: Option<String>,
}

#[derive(Default)]
struct SessionTable {
    conversations: HashMap<String, ChatSession>,
}

static SESSIONS: OnceLock<Mutex<SessionTable>> = OnceLock::new();

fn sessions() -> &'static Mutex<SessionTable> {
    SESSIONS.get_or_init(|| Mutex::new(SessionTable::default()))
}

pub fn get_session(conversation_id: &str) -> Option<ChatSession> {
    sessions().lock().ok()?.conversations.get(conversation_id).cloned()
}

/// Bind (or update) a conversation's session facts. A known native id is
/// never overwritten with `None`.
pub fn upsert_session(conversation_id: &str, agent_id: &str, native_session_id: Option<String>, model: Option<String>) {
    let Ok(mut table) = sessions().lock() else { return };
    let entry = table.conversations.entry(conversation_id.to_string()).or_insert_with(|| ChatSession {
        agent_id: agent_id.into(),
        native_session_id: None,
        model: None,
    });
    entry.agent_id = agent_id.into();
    if native_session_id.is_some() {
        entry.native_session_id = native_session_id;
    }
    if model.is_some() {
        entry.model = model;
    }
}

pub fn remove_session(conversation_id: &str) {
    if let Ok(mut table) = sessions().lock() {
        table.conversations.remove(conversation_id);
    }
}

// ---------------------------------------------------------------------------
// Running chat processes, keyed by conversation for targeted cancellation.
// ---------------------------------------------------------------------------

#[derive(Default)]
struct ProcessState {
    closing: bool,
    by_conversation: HashMap<String, u32>,
    pids: BTreeSet<u32>,
}

#[derive(Default)]
pub struct ChatProcesses {
    state: Mutex<ProcessState>,
}

pub struct ChatProcessGuard {
    registry: Arc<ChatProcesses>,
    conversation_id: String,
    pid: u32,
}

static CHAT_PROCESSES: OnceLock<Arc<ChatProcesses>> = OnceLock::new();

pub fn processes() -> Arc<ChatProcesses> {
    CHAT_PROCESSES.get_or_init(|| Arc::new(ChatProcesses::default())).clone()
}

fn terminate_chat_tree(pid: u32) {
    // Synchronous and reaped: application exit must not launch detached
    // cleanup work. Negative pid targets the whole process group.
    #[cfg(unix)]
    let _ = std::process::Command::new("/bin/kill")
        .args(["-KILL", "--", &format!("-{pid}")])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    #[cfg(windows)]
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

impl ChatProcesses {
    pub fn spawn(
        self: &Arc<Self>,
        conversation_id: &str,
        command: &mut tokio::process::Command,
    ) -> Result<(tokio::process::Child, ChatProcessGuard), AppError> {
        let mut state = self.state.lock().map_err(AppError::internal)?;
        if state.closing {
            return Err(AppError::cancelled("应用正在退出，未启动对话进程"));
        }
        if state.by_conversation.contains_key(conversation_id) {
            return Err(AppError::invalid_input("该对话已有正在进行的回答，请先停止或等待完成"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
        }
        let child = command.spawn().map_err(AppError::io)?;
        let pid = child.id().ok_or_else(|| AppError::internal("无法获取对话进程标识"))?;
        state.by_conversation.insert(conversation_id.to_string(), pid);
        state.pids.insert(pid);
        Ok((
            child,
            ChatProcessGuard { registry: self.clone(), conversation_id: conversation_id.to_string(), pid },
        ))
    }

    fn remove(&self, conversation_id: &str, pid: u32, terminate: bool) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.by_conversation.remove(conversation_id);
        if state.pids.remove(&pid) && terminate {
            terminate_chat_tree(pid);
        }
    }

    /// Kill the process group of a conversation's running turn, if any.
    pub fn cancel(&self, conversation_id: &str) -> bool {
        let pid = {
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            state.by_conversation.get(conversation_id).copied()
        };
        if let Some(pid) = pid {
            terminate_chat_tree(pid);
            true
        } else {
            false
        }
    }

    /// OS pid of a conversation's running turn (tests/diagnostics).
    pub fn conversation_pid(&self, conversation_id: &str) -> Option<u32> {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.by_conversation.get(conversation_id).copied()
    }

    fn shutdown(&self) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.closing = true;
        state.by_conversation.clear();
        for pid in std::mem::take(&mut state.pids) {
            terminate_chat_tree(pid);
        }
    }
}

impl ChatProcessGuard {
    /// The child exited normally; deregister without killing.
    pub fn finish(self) {
        self.registry.remove(&self.conversation_id, self.pid, false);
    }
}

impl Drop for ChatProcessGuard {
    fn drop(&mut self) {
        self.registry.remove(&self.conversation_id, self.pid, true);
    }
}

/// Call from both normal application exit and explicit replacement/restart
/// exits. Sessions are memory-only, so they die with the process naturally.
pub fn shutdown() {
    processes().shutdown();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_upsert_never_drops_known_native_id() {
        let id = "conv-test-1";
        upsert_session(id, "codex", None, Some("gpt-5".into()));
        assert_eq!(get_session(id).unwrap().native_session_id, None);
        upsert_session(id, "codex", Some("thread-1".into()), None);
        let session = get_session(id).unwrap();
        assert_eq!(session.native_session_id.as_deref(), Some("thread-1"));
        assert_eq!(session.model.as_deref(), Some("gpt-5"));
        upsert_session(id, "codex", None, None);
        assert_eq!(get_session(id).unwrap().native_session_id.as_deref(), Some("thread-1"));
        remove_session(id);
        assert!(get_session(id).is_none());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancel_kills_running_conversation_tree() {
        let registry = Arc::new(ChatProcesses::default());
        let dir = tempfile::tempdir().unwrap();
        let mut command = tokio::process::Command::new("/bin/sh");
        command.args(["-c", "sleep 60 & echo $! > child.pid; wait"]).current_dir(dir.path());
        let (mut child, guard) = registry.spawn("conv-kill", &mut command).unwrap();
        let mut descendant = String::new();
        for _ in 0..100 {
            if let Ok(pid) = std::fs::read_to_string(dir.path().join("child.pid")) {
                descendant = pid.trim().to_string();
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        assert!(!descendant.is_empty());
        assert!(registry.cancel("conv-kill"));
        tokio::time::timeout(std::time::Duration::from_secs(2), child.wait()).await.unwrap().unwrap();
        let alive = std::process::Command::new("/bin/kill")
            .args(["-0", &descendant])
            .stderr(Stdio::null())
            .status()
            .unwrap()
            .success();
        assert!(!alive);
        drop(guard);
        assert!(!registry.cancel("conv-kill"));
    }
}
