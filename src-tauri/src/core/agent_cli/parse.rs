//! Incremental stream parsers turning agent CLI stdout into [`ChatEvent`]s.
//!
//! Ported from OpenDesign `runtimes/claude-stream.ts` and
//! `runtimes/json-event-stream.ts`. Each parser is a stateful machine fed
//! with arbitrary stdout chunks; incomplete lines are buffered internally.
//! OpenDesign-specific concerns (artifact dedup, role-marker guards, child
//! evidence, task snapshots) are intentionally not ported.
use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::defs::{EventKind, StreamFormat};

/// Recursive JSON value for tool inputs. `serde_json::Value` cannot appear in
/// specta exports (inline recursion breaks the TypeScript exporter), but a
/// named recursive enum exports fine as a TS union and has the identical
/// wire format (untagged).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(untagged)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<JsonValue>),
    Object(std::collections::BTreeMap<String, JsonValue>),
}

impl JsonValue {
    pub fn get(&self, key: &str) -> Option<&JsonValue> {
        match self {
            JsonValue::Object(map) => map.get(key),
            _ => None,
        }
    }
}

impl From<Value> for JsonValue {
    fn from(value: Value) -> Self {
        match value {
            Value::Null => JsonValue::Null,
            Value::Bool(b) => JsonValue::Bool(b),
            Value::Number(n) => JsonValue::Number(n.as_f64().unwrap_or(0.0)),
            Value::String(s) => JsonValue::String(s),
            Value::Array(items) => JsonValue::Array(items.into_iter().map(Into::into).collect()),
            Value::Object(map) => {
                JsonValue::Object(map.into_iter().map(|(k, v)| (k, v.into())).collect())
            }
        }
    }
}

/// Unified event stream pushed to the frontend over the chat channel.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatEvent {
    Status {
        label: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
    },
    TextDelta {
        delta: String,
    },
    ThinkingDelta {
        delta: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: JsonValue,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        is_error: bool,
    },
    Usage {
        #[serde(skip_serializing_if = "Option::is_none")]
        input_tokens: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        output_tokens: Option<u64>,
    },
    Error {
        message: String,
        /// auth_required | rate_limited | upstream_unavailable | execution_failed
        category: String,
    },
    Done {
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<i32>,
    },
}

impl ChatEvent {
    fn status(label: &str, session_id: Option<String>) -> Self {
        ChatEvent::Status { label: label.into(), session_id }
    }

    fn error(message: impl Into<String>) -> Self {
        ChatEvent::Error { message: message.into(), category: "execution_failed".into() }
    }
}

fn stringify_content(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// lenient JSON parse: strings that aren't JSON come back as-is (Some),
/// anything unparseable as structured input stays a string value.
fn parse_input(value: &Value) -> Value {
    match value {
        Value::String(s) => serde_json::from_str(s).unwrap_or_else(|_| value.clone()),
        other => other.clone(),
    }
}

/// Pull a human-readable message out of nested error shapes.
fn extract_error_message(value: &Value, fallback: &str) -> String {
    match value {
        Value::String(s) => {
            if let Ok(parsed) = serde_json::from_str::<Value>(s)
                && parsed.is_object()
            {
                return extract_error_message(&parsed, s);
            }
            s.clone()
        }
        Value::Object(map) => {
            for key in ["detail", "message", "error"] {
                if let Some(inner) = map.get(key) {
                    let text = extract_error_message(inner, "");
                    if !text.is_empty() {
                        return text;
                    }
                }
            }
            if let Some(data) = map.get("data") {
                let text = extract_error_message(data, "");
                if !text.is_empty() {
                    return text;
                }
            }
            map.get("name").and_then(Value::as_str).unwrap_or(fallback).to_string()
        }
        _ => fallback.to_string(),
    }
}

fn as_u64(value: &Value) -> Option<u64> {
    value.as_u64().or_else(|| value.as_f64().filter(|f| *f >= 0.0).map(|f| f as u64))
}

/// Line-buffered splitter shared by every parser; incomplete trailing data
/// stays buffered until the newline arrives (or `take_rest` at stream end).
#[derive(Default)]
struct LineBuffer {
    buffer: String,
}

impl LineBuffer {
    fn push_and_take_lines(&mut self, chunk: &str) -> Vec<String> {
        self.buffer.push_str(chunk);
        let mut lines = Vec::new();
        while let Some(nl) = self.buffer.find('\n') {
            let line = self.buffer[..nl].trim().to_string();
            self.buffer.drain(..nl + 1);
            if !line.is_empty() {
                lines.push(line);
            }
        }
        lines
    }

    fn take_rest(&mut self) -> Option<String> {
        let rem = self.buffer.trim().to_string();
        self.buffer.clear();
        if rem.is_empty() { None } else { Some(rem) }
    }
}

// ---------------------------------------------------------------------------
// claude stream-json (`--output-format stream-json --verbose`, with or
// without `--include-partial-messages`)
// ---------------------------------------------------------------------------

#[derive(Default)]
struct BlockState {
    kind: Option<String>,
    name: Option<String>,
    id: Option<String>,
    input: String,
    input_value: Option<Value>,
}

#[derive(Default)]
struct ClaudeParser {
    lines: LineBuffer,
    /// Per-content-block scratch, keyed by `${message_id}:${index}`.
    blocks: HashMap<String, BlockState>,
    /// Tool uses already emitted from streamed `input_json_delta` data; the
    /// final assistant wrapper repeats them (often with `{}` inputs).
    streamed_tool_use_ids: HashSet<String>,
    current_message_id: Option<String>,
    /// Message ids that already streamed text/thinking via `stream_event`
    /// deltas — without partial messages the final `assistant` wrapper is
    /// the only text source, with them the wrapper would duplicate.
    text_streamed: HashSet<String>,
    thinking_streamed: HashSet<String>,
    current_streamed_text: bool,
    current_streamed_thinking: bool,
}

impl ClaudeParser {
    fn block_key(&self, index: &Value) -> String {
        let index = index.as_u64().unwrap_or(0);
        format!("{}:{index}", self.current_message_id.as_deref().unwrap_or("anon"))
    }

    fn handle_line(&mut self, line: &str, events: &mut Vec<ChatEvent>) {
        let Ok(obj) = serde_json::from_str::<Value>(line) else { return };
        let Some(map) = obj.as_object() else { return };
        let kind = map.get("type").and_then(Value::as_str).unwrap_or("");

        if kind == "system" && map.get("subtype").and_then(Value::as_str) == Some("init") {
            let session_id = map
                .get("session_id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(String::from);
            events.push(ChatEvent::status("initializing", session_id));
            return;
        }
        if kind == "system" && map.get("subtype").and_then(Value::as_str) == Some("status") {
            let label = map.get("status").and_then(Value::as_str).unwrap_or("working");
            events.push(ChatEvent::status(label, None));
            return;
        }
        if kind == "stream_event" {
            if let Some(event) = map.get("event") {
                self.handle_stream_event(event, events);
            }
            return;
        }
        if kind == "assistant" {
            self.handle_assistant(&obj, events);
            return;
        }
        if kind == "user" {
            if let Some(content) = obj.pointer("/message/content").and_then(Value::as_array) {
                for block in content {
                    if block.get("type").and_then(Value::as_str) != Some("tool_result") {
                        continue;
                    }
                    let content = match block.get("content") {
                        Some(Value::String(s)) => s.clone(),
                        Some(Value::Array(parts)) => parts
                            .iter()
                            .map(|part| {
                                if part.get("type").and_then(Value::as_str) == Some("text") {
                                    part.get("text").and_then(Value::as_str).unwrap_or("").to_string()
                                } else {
                                    part.to_string()
                                }
                            })
                            .collect::<Vec<_>>()
                            .join("\n"),
                        Some(other) => other.to_string(),
                        None => String::new(),
                    };
                    events.push(ChatEvent::ToolResult {
                        tool_use_id: block
                            .get("tool_use_id")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        content,
                        is_error: block.get("is_error").and_then(Value::as_bool).unwrap_or(false),
                    });
                }
            }
            return;
        }
        if kind == "result" {
            let usage = map.get("usage");
            events.push(ChatEvent::Usage {
                input_tokens: usage.and_then(|u| u.get("input_tokens")).and_then(as_u64),
                output_tokens: usage.and_then(|u| u.get("output_tokens")).and_then(as_u64),
            });
            if map.get("is_error").and_then(Value::as_bool) == Some(true) {
                let message = if let Some(errors) = map.get("errors").and_then(Value::as_array) {
                    let parts: Vec<&str> = errors.iter().filter_map(Value::as_str).collect();
                    if parts.is_empty() {
                        map.get("result").and_then(Value::as_str).unwrap_or("Claude 运行失败").to_string()
                    } else {
                        parts.join("\n")
                    }
                } else {
                    map.get("result").and_then(Value::as_str).unwrap_or("Claude 运行失败").to_string()
                };
                events.push(ChatEvent::error(message));
            }
        }
    }

    fn handle_assistant(&mut self, obj: &Value, events: &mut Vec<ChatEvent>) {
        let Some(content) = obj.pointer("/message/content").and_then(Value::as_array) else {
            return;
        };
        let explicit_id = obj
            .pointer("/message/id")
            .and_then(Value::as_str)
            .map(String::from);
        let text_msg_id = explicit_id.clone().or_else(|| {
            if self.current_streamed_text { self.current_message_id.clone() } else { None }
        });
        let thinking_msg_id = explicit_id.clone().or_else(|| {
            if self.current_streamed_thinking { self.current_message_id.clone() } else { None }
        });
        if let Some(id) = &explicit_id {
            self.current_message_id = Some(id.clone());
        }
        let text_done = text_msg_id.as_ref().is_some_and(|id| self.text_streamed.contains(id));
        let thinking_done =
            thinking_msg_id.as_ref().is_some_and(|id| self.thinking_streamed.contains(id));
        for block in content {
            let kind = block.get("type").and_then(Value::as_str).unwrap_or("");
            match kind {
                "tool_use" => {
                    let id = block.get("id").and_then(Value::as_str).unwrap_or("");
                    if self.streamed_tool_use_ids.contains(id) {
                        continue;
                    }
                    events.push(ChatEvent::ToolUse {
                        id: id.to_string(),
                        name: block.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
                        input: block.get("input").cloned().map(JsonValue::from).unwrap_or(JsonValue::Null),
                    });
                }
                "text" if !text_done => {
                    if let Some(text) = block.get("text").and_then(Value::as_str).filter(|t| !t.is_empty()) {
                        events.push(ChatEvent::TextDelta { delta: text.to_string() });
                    }
                }
                "thinking" if !thinking_done => {
                    if let Some(thinking) =
                        block.get("thinking").and_then(Value::as_str).filter(|t| !t.is_empty())
                    {
                        events.push(ChatEvent::ThinkingDelta { delta: thinking.to_string() });
                    }
                }
                _ => {}
            }
        }
        self.current_streamed_text = false;
        self.current_streamed_thinking = false;
    }

    fn handle_stream_event(&mut self, event: &Value, events: &mut Vec<ChatEvent>) {
        let kind = event.get("type").and_then(Value::as_str).unwrap_or("");
        match kind {
            "message_start" => {
                self.current_message_id = event
                    .pointer("/message/id")
                    .and_then(Value::as_str)
                    .map(String::from);
                self.current_streamed_text = false;
                self.current_streamed_thinking = false;
            }
            "content_block_start" => {
                if let Some(block) = event.get("content_block") {
                    let key = self.block_key(event.get("index").unwrap_or(&Value::Null));
                    self.blocks.insert(
                        key,
                        BlockState {
                            kind: block.get("type").and_then(Value::as_str).map(String::from),
                            name: block.get("name").and_then(Value::as_str).map(String::from),
                            id: block.get("id").and_then(Value::as_str).map(String::from),
                            input: String::new(),
                            input_value: block.get("input").cloned(),
                        },
                    );
                }
            }
            "content_block_delta" => {
                let Some(delta) = event.get("delta") else { return };
                let delta_kind = delta.get("type").and_then(Value::as_str).unwrap_or("");
                match delta_kind {
                    "text_delta" => {
                        if let Some(text) = delta.get("text").and_then(Value::as_str) {
                            if let Some(id) = &self.current_message_id {
                                self.text_streamed.insert(id.clone());
                            }
                            self.current_streamed_text = true;
                            events.push(ChatEvent::TextDelta { delta: text.to_string() });
                        }
                    }
                    "thinking_delta" => {
                        if let Some(thinking) = delta.get("thinking").and_then(Value::as_str) {
                            if let Some(id) = &self.current_message_id {
                                self.thinking_streamed.insert(id.clone());
                            }
                            self.current_streamed_thinking = true;
                            events.push(ChatEvent::ThinkingDelta { delta: thinking.to_string() });
                        }
                    }
                    "input_json_delta" => {
                        if let Some(partial) = delta.get("partial_json").and_then(Value::as_str) {
                            let key = self.block_key(event.get("index").unwrap_or(&Value::Null));
                            if let Some(state) = self.blocks.get_mut(&key)
                                && state.kind.as_deref() == Some("tool_use")
                            {
                                state.input.push_str(partial);
                            }
                        }
                    }
                    _ => {}
                }
            }
            "content_block_stop" => {
                let key = self.block_key(event.get("index").unwrap_or(&Value::Null));
                if let Some(state) = self.blocks.remove(&key)
                    && state.kind.as_deref() == Some("tool_use")
                {
                    {
                        if let (Some(id), Some(name)) = (state.id, state.name) {
                            let input = if !state.input.trim().is_empty() {
                                serde_json::from_str::<Value>(&state.input).ok()
                            } else {
                                state.input_value
                            };
                            if let Some(input) = input {
                                self.streamed_tool_use_ids.insert(id.clone());
                                events.push(ChatEvent::ToolUse { id, name, input: input.into() });
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------
// json-event-stream: codex / kimi / opencode / gemini (qwen) / cursor-agent
// ---------------------------------------------------------------------------

#[derive(Default)]
struct JsonEventState {
    // cursor-agent terminal-replay reconciliation.
    cursor_text_so_far: String,
    cursor_turn_start: usize,
    open_code_tool_uses: HashSet<String>,
    open_code_tool_results: HashSet<String>,
    codex_tool_uses: HashSet<String>,
    codex_error_emitted: bool,
    codex_prev_was_agent_message: bool,
    codex_last_agent_message_ended_with_newline: bool,
    /// Reasoning-item chars already emitted, keyed by item id — codex replays
    /// the accumulated summary on every lifecycle event of the same item.
    codex_reasoning_emitted_by_item: HashMap<String, usize>,
    codex_reasoning_emitted_any: bool,
}

struct JsonEventParser {
    lines: LineBuffer,
    kind: EventKind,
    state: JsonEventState,
}

impl JsonEventParser {
    fn handle_line(&mut self, line: &str, events: &mut Vec<ChatEvent>) {
        let Ok(obj) = serde_json::from_str::<Value>(line) else { return };
        let handled = match self.kind {
            EventKind::Codex => handle_codex(&obj, events, &mut self.state),
            EventKind::Kimi => handle_kimi(&obj, events),
            EventKind::OpenCode => handle_opencode(&obj, events, &mut self.state),
            EventKind::Gemini => handle_gemini(&obj, events),
            EventKind::Cursor => handle_cursor(&obj, events, &mut self.state),
        };
        let _ = handled;
    }
}

fn handle_codex(obj: &Value, events: &mut Vec<ChatEvent>, state: &mut JsonEventState) -> bool {
    let kind = obj.get("type").and_then(Value::as_str).unwrap_or("");

    if kind == "error" {
        let message = extract_error_message(
            obj.get("message").or_else(|| obj.get("error")).unwrap_or(&Value::Null),
            "Codex error",
        );
        // Reconnect notices are recoverable — surface as status, not failure.
        if message.starts_with("Reconnecting...")
            && (message.contains("timeout waiting for child process to exit")
                || message.contains("stream disconnected before completion"))
        {
            events.push(ChatEvent::status(&message, None));
            return true;
        }
        if !state.codex_error_emitted {
            state.codex_error_emitted = true;
            events.push(ChatEvent::error(message));
        }
        return true;
    }
    if kind == "turn.failed" {
        if !state.codex_error_emitted {
            state.codex_error_emitted = true;
            events.push(ChatEvent::error(extract_error_message(
                obj.get("error").or_else(|| obj.get("message")).unwrap_or(&Value::Null),
                "Codex turn failed",
            )));
        }
        return true;
    }
    if kind == "thread.started" {
        // Capture-style session handle: replayed as `exec resume <thread_id>`.
        let thread_id = obj
            .get("thread_id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(String::from);
        events.push(ChatEvent::status("initializing", thread_id));
        return true;
    }
    if kind == "turn.started" {
        state.codex_prev_was_agent_message = false;
        state.codex_last_agent_message_ended_with_newline = false;
        events.push(ChatEvent::status("thinking", None));
        return true;
    }

    let is_item_event = matches!(kind, "item.started" | "item.updated" | "item.completed");
    if is_item_event {
        let Some(item) = obj.get("item") else { return false };
        let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
        if item_type == "reasoning" {
            let key = item.get("id").and_then(Value::as_str).unwrap_or("").to_string();
            let text = item.get("text").and_then(Value::as_str).unwrap_or("");
            let emitted = *state.codex_reasoning_emitted_by_item.get(&key).unwrap_or(&0);
            if text.len() > emitted {
                let suffix = &text[emitted..];
                let delta =
                    if emitted == 0 && state.codex_reasoning_emitted_any {
                        format!("\n\n{suffix}")
                    } else {
                        suffix.to_string()
                    };
                events.push(ChatEvent::ThinkingDelta { delta });
                state.codex_reasoning_emitted_by_item.insert(key, text.len());
                state.codex_reasoning_emitted_any = true;
            }
            return true;
        }
        if item_type == "error" && kind == "item.completed" {
            if let Some(message) = item.get("message").and_then(Value::as_str).filter(|m| !m.is_empty()) {
                events.push(ChatEvent::status("warning", None));
                let _ = message;
            }
            return true;
        }
        if item_type == "command_execution" {
            state.codex_prev_was_agent_message = false;
            state.codex_last_agent_message_ended_with_newline = false;
            let Some(id) = item.get("id").and_then(Value::as_str) else { return true };
            if !state.codex_tool_uses.contains(id) {
                state.codex_tool_uses.insert(id.to_string());
                let command = item.get("command").and_then(Value::as_str).unwrap_or("");
                events.push(ChatEvent::ToolUse {
                    id: id.to_string(),
                    name: "Bash".into(),
                    input: serde_json::json!({ "command": command }).into(),
                });
            }
            if kind == "item.completed" {
                let content = stringify_content(item.get("aggregated_output").unwrap_or(&Value::Null));
                let is_error = item
                    .get("exit_code")
                    .and_then(Value::as_i64)
                    .map(|code| code != 0)
                    .unwrap_or_else(|| item.get("status").and_then(Value::as_str) == Some("failed"));
                events.push(ChatEvent::ToolResult {
                    tool_use_id: id.to_string(),
                    content,
                    is_error,
                });
            }
            return true;
        }
        if item_type == "agent_message" && kind == "item.completed" {
            if let Some(text) = item.get("text").and_then(Value::as_str).filter(|t| !t.is_empty()) {
                let needs_boundary = state.codex_prev_was_agent_message
                    && !state.codex_last_agent_message_ended_with_newline
                    && !text.starts_with('\n');
                let delta = if needs_boundary { format!("\n{text}") } else { text.to_string() };
                events.push(ChatEvent::TextDelta { delta });
                state.codex_prev_was_agent_message = true;
                state.codex_last_agent_message_ended_with_newline = text.ends_with('\n');
            }
            return true;
        }
        return is_item_event;
    }

    if kind == "turn.completed" {
        if let Some(usage) = obj.get("usage") {
            events.push(ChatEvent::Usage {
                input_tokens: usage.get("input_tokens").and_then(as_u64),
                output_tokens: usage.get("output_tokens").and_then(as_u64),
            });
        }
        return true;
    }
    false
}

fn handle_kimi(obj: &Value, events: &mut Vec<ChatEvent>) -> bool {
    let role = obj.get("role").and_then(Value::as_str).unwrap_or("");

    if role == "assistant" {
        if let Some(calls) = obj.get("tool_calls").and_then(Value::as_array) {
            for call in calls {
                let id = call.get("id").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty());
                let name = call
                    .pointer("/function/name")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|s| !s.is_empty());
                if let (Some(id), Some(name)) = (id, name) {
                    let input = call
                        .pointer("/function/arguments")
                        .map(parse_input)
                        .map(JsonValue::from)
                        .unwrap_or(JsonValue::Null);
                    events.push(ChatEvent::ToolUse {
                        id: id.to_string(),
                        name: name.to_string(),
                        input,
                    });
                }
            }
            return true;
        }
        if let Some(content) = obj.get("content").and_then(Value::as_str).filter(|c| !c.is_empty()) {
            events.push(ChatEvent::TextDelta { delta: content.to_string() });
            return true;
        }
        return false;
    }
    if role == "tool" {
        if let Some(id) = obj.get("tool_call_id").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()) {
            events.push(ChatEvent::ToolResult {
                tool_use_id: id.to_string(),
                content: stringify_content(obj.get("content").unwrap_or(&Value::Null)),
                is_error: false,
            });
            return true;
        }
        return false;
    }
    if role == "meta" && obj.get("type").and_then(Value::as_str) == Some("session.resume_hint") {
        // Capture-style session handle ("kimi --resume <id>" next turn).
        let session_id = obj
            .get("session_id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(String::from);
        if session_id.is_some() {
            events.push(ChatEvent::status("session", session_id));
        }
        return true;
    }
    false
}

fn opencode_tool_result(tool: &str, state_part: &Value) -> Option<(String, bool)> {
    let status = state_part.get("status").and_then(Value::as_str).unwrap_or("").to_lowercase();
    if status != "completed" && status != "error" && status != "failed" {
        return None;
    }
    let exit_codes = [
        state_part.get("exit"),
        state_part.get("exitCode"),
        state_part.pointer("/metadata/exit"),
    ];
    let non_zero_exit = exit_codes
        .into_iter()
        .flatten()
        .filter_map(Value::as_i64)
        .any(|code| code != 0);
    let explicit_error = state_part.get("error").filter(|e| match e {
        Value::String(s) => !s.trim().is_empty(),
        Value::Object(map) => !map.is_empty(),
        _ => false,
    });
    let is_error = status == "error" || status == "failed" || explicit_error.is_some() || non_zero_exit;
    let _ = tool;
    let content = stringify_content(explicit_error.or_else(|| state_part.get("output")).unwrap_or(&Value::Null));
    Some((content, is_error))
}

fn handle_opencode(obj: &Value, events: &mut Vec<ChatEvent>, state: &mut JsonEventState) -> bool {
    let kind = obj.get("type").and_then(Value::as_str).unwrap_or("");
    let part = obj.get("part").cloned().unwrap_or(Value::Null);

    if kind == "step_start" {
        // `sessionID` is the capture-style resume handle (`run -s <id>`).
        let session_id = obj
            .get("sessionID")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(String::from);
        events.push(ChatEvent::status("running", session_id));
        return true;
    }
    if kind == "text" {
        if let Some(text) = part.get("text").and_then(Value::as_str).filter(|t| !t.is_empty()) {
            events.push(ChatEvent::TextDelta { delta: text.to_string() });
        }
        return true;
    }
    if kind == "tool_use" {
        let (Some(tool), Some(call_id)) = (
            part.get("tool").and_then(Value::as_str),
            part.get("callID").and_then(Value::as_str),
        ) else {
            return false;
        };
        let key = format!(
            "{}:{call_id}",
            obj.get("sessionID").and_then(Value::as_str).unwrap_or("session")
        );
        let state_part = part.get("state");
        if !state.open_code_tool_uses.contains(&key) {
            state.open_code_tool_uses.insert(key.clone());
            let input = state_part.and_then(|s| s.get("input")).map(parse_input).map(JsonValue::from).unwrap_or(JsonValue::Null);
            events.push(ChatEvent::ToolUse {
                id: call_id.to_string(),
                name: tool.to_string(),
                input,
            });
        }
        if let Some(state_part) = state_part
            && let Some((content, is_error)) = opencode_tool_result(tool, state_part)
        {
            {
                if !state.open_code_tool_results.contains(&key) {
                    state.open_code_tool_results.insert(key);
                    events.push(ChatEvent::ToolResult {
                        tool_use_id: call_id.to_string(),
                        content,
                        is_error,
                    });
                }
            }
        }
        return true;
    }
    if kind == "step_finish" {
        let tokens = part.get("tokens");
        let input_tokens = tokens.and_then(|t| t.get("input")).and_then(as_u64);
        let output_tokens = tokens.and_then(|t| t.get("output")).and_then(as_u64);
        if input_tokens.is_some() || output_tokens.is_some() {
            events.push(ChatEvent::Usage { input_tokens, output_tokens });
        }
        return true;
    }
    if kind == "error" {
        let message = extract_error_message(
            obj.get("error").or_else(|| obj.get("message")).unwrap_or(&Value::Null),
            "OpenCode error",
        );
        events.push(ChatEvent::error(message));
        return true;
    }
    false
}

fn handle_gemini(obj: &Value, events: &mut Vec<ChatEvent>) -> bool {
    let kind = obj.get("type").and_then(Value::as_str).unwrap_or("");

    if kind == "init" {
        events.push(ChatEvent::status("initializing", None));
        return true;
    }
    if kind == "message" && obj.get("role").and_then(Value::as_str) == Some("user") {
        return true;
    }
    if kind == "message" && obj.get("role").and_then(Value::as_str) == Some("assistant") {
        if let Some(content) = obj.get("content").and_then(Value::as_str).filter(|c| !c.is_empty()) {
            events.push(ChatEvent::TextDelta { delta: content.to_string() });
        }
        return true;
    }
    if kind == "tool_use" {
        let (Some(id), Some(name)) = (
            obj.get("tool_id").and_then(Value::as_str),
            obj.get("tool_name").and_then(Value::as_str),
        ) else {
            return false;
        };
        let input = obj.get("parameters").map(parse_input).map(JsonValue::from).unwrap_or(JsonValue::Null);
        events.push(ChatEvent::ToolUse { id: id.to_string(), name: name.to_string(), input });
        return true;
    }
    if kind == "tool_result" {
        let Some(id) = obj.get("tool_id").and_then(Value::as_str) else { return false };
        let error = obj.get("error").filter(|v| v.is_object());
        let error_message = error.map(|e| extract_error_message(e, "")).unwrap_or_default();
        let output = match obj.get("output").and_then(Value::as_str) {
            Some(output) => output.to_string(),
            None if !error_message.is_empty() => error_message,
            None => stringify_content(obj.get("output").unwrap_or(&Value::Null)),
        };
        events.push(ChatEvent::ToolResult {
            tool_use_id: id.to_string(),
            content: output,
            is_error: obj.get("status").and_then(Value::as_str) == Some("error") || error.is_some(),
        });
        return true;
    }
    if kind == "error" {
        let severity = obj.get("severity").and_then(Value::as_str).unwrap_or("").to_lowercase();
        let message = extract_error_message(
            obj.get("message").or_else(|| obj.get("error")).unwrap_or(&Value::Null),
            if severity == "warning" { "Gemini CLI warning" } else { "Gemini CLI error" },
        );
        if severity == "warning" {
            events.push(ChatEvent::status("warning", None));
        } else {
            events.push(ChatEvent::error(message));
        }
        return true;
    }
    if kind == "result" {
        if obj.get("status").and_then(Value::as_str) == Some("error") || obj.get("error").is_some_and(Value::is_object) {
            events.push(ChatEvent::error(extract_error_message(
                obj.get("error").unwrap_or(&Value::Null),
                "Gemini CLI error",
            )));
            return true;
        }
        if let Some(stats) = obj.get("stats") {
            events.push(ChatEvent::Usage {
                input_tokens: stats.get("input_tokens").and_then(as_u64),
                output_tokens: stats.get("output_tokens").and_then(as_u64),
            });
        }
        return true;
    }
    false
}

fn extract_cursor_text(message: &Value) -> String {
    message
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|b| b.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// Real-time delta (`--stream-partial-output`): emit verbatim, accumulate for
/// later terminal-replay reconciliation.
fn emit_cursor_delta(text: &str, events: &mut Vec<ChatEvent>, state: &mut JsonEventState) {
    if text.is_empty() {
        return;
    }
    state.cursor_text_so_far.push_str(text);
    events.push(ChatEvent::TextDelta { delta: text.to_string() });
}

/// A terminal replay carries the current turn's full text; emit only the
/// suffix past what was already streamed this turn. On divergence (a dropped
/// chunk), leave the append-only stream untouched. Always advances the turn
/// boundary.
fn reconcile_cursor_turn_replay(text: &str, events: &mut Vec<ChatEvent>, state: &mut JsonEventState) {
    let emitted_turn = &state.cursor_text_so_far[state.cursor_turn_start..];
    if !text.is_empty() && text != emitted_turn && text.starts_with(emitted_turn) {
        let suffix = &text[emitted_turn.len()..];
        if !suffix.is_empty() {
            events.push(ChatEvent::TextDelta { delta: suffix.to_string() });
            state.cursor_text_so_far.push_str(suffix);
        }
    }
    state.cursor_turn_start = state.cursor_text_so_far.len();
}

fn handle_cursor(obj: &Value, events: &mut Vec<ChatEvent>, state: &mut JsonEventState) -> bool {
    let kind = obj.get("type").and_then(Value::as_str).unwrap_or("");

    if kind == "system" && obj.get("subtype").and_then(Value::as_str) == Some("init") {
        events.push(ChatEvent::status("initializing", None));
        return true;
    }
    if kind == "assistant" {
        let Some(message) = obj.get("message") else { return false };
        let text = extract_cursor_text(message);
        if obj.get("model_call_id").and_then(Value::as_str).is_some() {
            reconcile_cursor_turn_replay(&text, events, state);
            return true;
        }
        if text.is_empty() {
            return false;
        }
        if obj.get("timestamp_ms").is_some_and(Value::is_number) {
            emit_cursor_delta(&text, events, state);
            return true;
        }
        reconcile_cursor_turn_replay(&text, events, state);
        return true;
    }
    if kind == "result" {
        if let Some(usage) = obj.get("usage") {
            events.push(ChatEvent::Usage {
                input_tokens: usage.get("inputTokens").and_then(as_u64),
                output_tokens: usage.get("outputTokens").and_then(as_u64),
            });
        }
        return true;
    }
    false
}

// ---------------------------------------------------------------------------
// Public parser facade
// ---------------------------------------------------------------------------

enum Inner {
    Claude(ClaudeParser),
    JsonEvent(JsonEventParser),
    Plain(LineBuffer),
}

/// Stateful incremental parser for one agent run.
pub struct StreamParser {
    inner: Inner,
}

impl StreamParser {
    pub fn new(format: StreamFormat) -> Self {
        let inner = match format {
            StreamFormat::ClaudeStreamJson => Inner::Claude(ClaudeParser::default()),
            StreamFormat::JsonEventStream(kind) => Inner::JsonEvent(JsonEventParser {
                lines: LineBuffer::default(),
                kind,
                state: JsonEventState::default(),
            }),
            StreamFormat::Plain => Inner::Plain(LineBuffer::default()),
        };
        StreamParser { inner }
    }

    pub fn feed(&mut self, chunk: &str) -> Vec<ChatEvent> {
        let mut events = Vec::new();
        match &mut self.inner {
            Inner::Claude(parser) => {
                for line in parser.lines.push_and_take_lines(chunk) {
                    parser.handle_line(&line, &mut events);
                }
            }
            Inner::JsonEvent(parser) => {
                for line in parser.lines.push_and_take_lines(chunk) {
                    parser.handle_line(&line, &mut events);
                }
            }
            Inner::Plain(lines) => {
                for line in lines.push_and_take_lines(chunk) {
                    events.push(ChatEvent::TextDelta { delta: format!("{line}\n") });
                }
            }
        }
        events
    }

    pub fn flush(&mut self) -> Vec<ChatEvent> {
        let mut events = Vec::new();
        match &mut self.inner {
            Inner::Claude(parser) => {
                if let Some(line) = parser.lines.take_rest() {
                    parser.handle_line(&line, &mut events);
                }
            }
            Inner::JsonEvent(parser) => {
                if let Some(line) = parser.lines.take_rest() {
                    parser.handle_line(&line, &mut events);
                }
            }
            Inner::Plain(lines) => {
                if let Some(line) = lines.take_rest() {
                    events.push(ChatEvent::TextDelta { delta: line });
                }
            }
        }
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_all(format: StreamFormat, input: &str) -> Vec<ChatEvent> {
        let mut parser = StreamParser::new(format);
        let mut events = parser.feed(input);
        events.extend(parser.flush());
        events
    }

    #[test]
    fn claude_partial_message_stream_dedupes_assistant_wrapper() {
        let input = concat!(
            r#"{"type":"system","subtype":"init","session_id":"sess-1","model":"sonnet"}"#, "\n",
            r#"{"type":"stream_event","event":{"type":"message_start","message":{"id":"m1"}}}"#, "\n",
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text"}}}"#, "\n",
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}}"#, "\n",
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"Bash"}}}"#, "\n",
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"command\":\"ls\"}"}}}"#, "\n",
            r#"{"type":"stream_event","event":{"type":"content_block_stop","index":1}}"#, "\n",
            // Final wrapper repeats text + tool_use; both must be suppressed.
            r#"{"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"你好"},{"type":"tool_use","id":"t1","name":"Bash","input":{}}]}}"#, "\n",
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"ok","is_error":false}]}}"#, "\n",
            r#"{"type":"result","usage":{"input_tokens":10,"output_tokens":5},"is_error":false}"#, "\n",
        );
        let events = parse_all(StreamFormat::ClaudeStreamJson, input);
        assert!(matches!(&events[0], ChatEvent::Status { label, session_id } if label == "initializing" && session_id.as_deref() == Some("sess-1")));
        let text: Vec<_> = events.iter().filter(|e| matches!(e, ChatEvent::TextDelta { .. })).collect();
        assert_eq!(text.len(), 1);
        let tools: Vec<_> = events
            .iter()
            .filter_map(|e| match e {
                ChatEvent::ToolUse { id, name, input } => Some((id, name, input)),
                _ => None,
            })
            .collect();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].0, "t1");
        assert_eq!(tools[0].1, "Bash");
        assert_eq!(tools[0].2.get("command"), Some(&JsonValue::String("ls".into())));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::ToolResult { tool_use_id, .. } if tool_use_id == "t1")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Usage { input_tokens: Some(10), output_tokens: Some(5) })));
    }

    #[test]
    fn claude_without_partial_messages_falls_back_to_assistant_wrapper() {
        let input = concat!(
            r#"{"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"完整回答"},{"type":"thinking","thinking":"思考"}]}}"#, "\n",
            r#"{"type":"result","is_error":true,"errors":["boom"]}"#, "\n",
        );
        let events = parse_all(StreamFormat::ClaudeStreamJson, input);
        assert!(events.iter().any(|e| matches!(e, ChatEvent::TextDelta { delta } if delta == "完整回答")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::ThinkingDelta { delta } if delta == "思考")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Error { message, .. } if message == "boom")));
    }

    #[test]
    fn claude_split_chunks_buffer_partial_lines() {
        let mut parser = StreamParser::new(StreamFormat::ClaudeStreamJson);
        assert!(parser.feed(r#"{"type":"system","subtype":"init","session"#).is_empty());
        let events = parser.feed(r#"_id":"s1"}"#);
        assert!(events.is_empty()); // still no newline
        let events = parser.feed("\n");
        assert!(matches!(&events[0], ChatEvent::Status { session_id, .. } if session_id.as_deref() == Some("s1")));
    }

    #[test]
    fn codex_captures_thread_id_and_streams_items() {
        let input = concat!(
            r#"{"type":"thread.started","thread_id":"thread-9"}"#, "\n",
            r#"{"type":"turn.started"}"#, "\n",
            r#"{"type":"item.started","item":{"id":"r1","type":"reasoning","text":"先想"}}"#, "\n",
            r#"{"type":"item.completed","item":{"id":"r1","type":"reasoning","text":"先想清楚"}}"#, "\n",
            r#"{"type":"item.started","item":{"id":"c1","type":"command_execution","command":"ls -la"}}"#, "\n",
            r#"{"type":"item.completed","item":{"id":"c1","type":"command_execution","command":"ls -la","aggregated_output":"ok","exit_code":0}}"#, "\n",
            r#"{"type":"item.completed","item":{"id":"a1","type":"agent_message","text":"完成"}}"#, "\n",
            r#"{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":7}}"#, "\n",
        );
        let events = parse_all(StreamFormat::JsonEventStream(EventKind::Codex), input);
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Status { label, session_id } if label == "initializing" && session_id.as_deref() == Some("thread-9"))));
        let thinking: String = events
            .iter()
            .filter_map(|e| match e {
                ChatEvent::ThinkingDelta { delta } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(thinking, "先想清楚");
        assert!(events.iter().any(|e| matches!(e, ChatEvent::ToolUse { name, input, .. } if name == "Bash" && input.get("command") == Some(&JsonValue::String("ls -la".into())))));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::ToolResult { tool_use_id, is_error, .. } if tool_use_id == "c1" && !is_error)));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::TextDelta { delta } if delta == "完成")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Usage { output_tokens: Some(7), .. })));
    }

    #[test]
    fn codex_emits_single_error() {
        let input = concat!(
            r#"{"type":"error","message":"boom"}"#, "\n",
            r#"{"type":"turn.failed","error":{"message":"boom2"}}"#, "\n",
        );
        let events = parse_all(StreamFormat::JsonEventStream(EventKind::Codex), input);
        let errors: Vec<_> = events.iter().filter(|e| matches!(e, ChatEvent::Error { .. })).collect();
        assert_eq!(errors.len(), 1);
    }

    #[test]
    fn kimi_openai_style_messages_and_resume_hint() {
        let input = concat!(
            r#"{"role":"assistant","tool_calls":[{"type":"function","id":"tool-1","function":{"name":"Write","arguments":"{\"path\":\"a.md\"}"}}]}"#, "\n",
            r#"{"role":"tool","tool_call_id":"tool-1","content":"Wrote"}"#, "\n",
            r#"{"role":"assistant","content":"Done."}"#, "\n",
            r#"{"role":"meta","type":"session.resume_hint","session_id":"session-1","content":"kimi -r session-1"}"#, "\n",
        );
        let events = parse_all(StreamFormat::JsonEventStream(EventKind::Kimi), input);
        assert!(events.iter().any(|e| matches!(e, ChatEvent::ToolUse { id, name, input } if id == "tool-1" && name == "Write" && input.get("path") == Some(&JsonValue::String("a.md".into())))));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::ToolResult { tool_use_id, .. } if tool_use_id == "tool-1")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::TextDelta { delta } if delta == "Done.")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Status { session_id, .. } if session_id.as_deref() == Some("session-1"))));
    }

    #[test]
    fn opencode_tool_use_result_deduped_and_usage() {
        let input = concat!(
            r#"{"type":"step_start","sessionID":"ses_1"}"#, "\n",
            r#"{"type":"text","part":{"text":"hi"},"sessionID":"ses_1"}"#, "\n",
            r#"{"type":"tool_use","part":{"tool":"bash","callID":"call1","state":{"status":"running","input":{"command":"ls"}}},"sessionID":"ses_1"}"#, "\n",
            r#"{"type":"tool_use","part":{"tool":"bash","callID":"call1","state":{"status":"completed","input":{"command":"ls"},"output":"files","exit":0}},"sessionID":"ses_1"}"#, "\n",
            r#"{"type":"step_finish","part":{"tokens":{"input":1,"output":2}}}"#, "\n",
        );
        let events = parse_all(StreamFormat::JsonEventStream(EventKind::OpenCode), input);
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Status { label, session_id } if label == "running" && session_id.as_deref() == Some("ses_1"))));
        let uses: Vec<_> = events.iter().filter(|e| matches!(e, ChatEvent::ToolUse { .. })).collect();
        let results: Vec<_> = events.iter().filter(|e| matches!(e, ChatEvent::ToolResult { .. })).collect();
        assert_eq!(uses.len(), 1);
        assert_eq!(results.len(), 1);
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Usage { input_tokens: Some(1), output_tokens: Some(2) })));
    }

    #[test]
    fn gemini_messages_tools_and_result() {
        let input = concat!(
            r#"{"type":"init","model":"qwen3-coder-plus"}"#, "\n",
            r#"{"type":"message","role":"user","content":"hi"}"#, "\n",
            r#"{"type":"message","role":"assistant","content":"回答"}"#, "\n",
            r#"{"type":"tool_use","tool_id":"t1","tool_name":"write_file","parameters":{"path":"a.md"}}"#, "\n",
            r#"{"type":"tool_result","tool_id":"t1","status":"ok","output":"done"}"#, "\n",
            r#"{"type":"result","stats":{"input_tokens":4,"output_tokens":6}}"#, "\n",
        );
        let events = parse_all(StreamFormat::JsonEventStream(EventKind::Gemini), input);
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Status { label, .. } if label == "initializing")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::TextDelta { delta } if delta == "回答")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::ToolUse { id, name, .. } if id == "t1" && name == "write_file")));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::ToolResult { tool_use_id, is_error, .. } if tool_use_id == "t1" && !is_error)));
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Usage { input_tokens: Some(4), output_tokens: Some(6) })));
    }

    #[test]
    fn cursor_deltas_then_terminal_replay_emits_only_suffix() {
        let input = concat!(
            r#"{"type":"system","subtype":"init","model":"auto"}"#, "\n",
            r#"{"type":"assistant","timestamp_ms":1,"message":{"content":[{"type":"text","text":"ha"}]}}"#, "\n",
            r#"{"type":"assistant","timestamp_ms":2,"message":{"content":[{"type":"text","text":"ha"}]}}"#, "\n",
            r#"{"type":"assistant","model_call_id":"mc1","message":{"content":[{"type":"text","text":"haha!"}]}}"#, "\n",
            r#"{"type":"result","usage":{"inputTokens":2,"outputTokens":3}}"#, "\n",
        );
        let events = parse_all(StreamFormat::JsonEventStream(EventKind::Cursor), input);
        let text: String = events
            .iter()
            .filter_map(|e| match e {
                ChatEvent::TextDelta { delta } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(text, "haha!");
        assert!(events.iter().any(|e| matches!(e, ChatEvent::Usage { input_tokens: Some(2), .. })));
    }
}

