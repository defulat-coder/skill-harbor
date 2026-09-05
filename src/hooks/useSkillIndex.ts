import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSkillSearchStatus, indexSkillSearch } from "../lib/skillSearch";
import { getErrorMessage } from "../lib/error";
import { queryKeys } from "../lib/queryKeys";

const BUILD_META_KEY = ["search", "build-meta"] as const;
const BUILD_MUTATION_KEY = ["search", "build-index"] as const;

interface BuildMeta {
  completedAt: string;
  error: string;
}

const EMPTY_BUILD_META: BuildMeta = { completedAt: "", error: "" };

// Indexing belongs to the application: navigating away must not lose the job
// state. The build runs as a mutation keyed in the global mutation cache, so
// `building` stays observable from any mounted view via useMutationState, and
// the result lands in the status query cache whichever screen started it.
export function useSkillIndex() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: queryKeys.search.status(),
    queryFn: getSkillSearchStatus,
  });
  const metaQuery = useQuery<BuildMeta>({
    queryKey: BUILD_META_KEY,
    queryFn: () => EMPTY_BUILD_META,
    initialData: EMPTY_BUILD_META,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const buildMutation = useMutation({
    mutationKey: BUILD_MUTATION_KEY,
    mutationFn: indexSkillSearch,
    onMutate: () => {
      queryClient.setQueryData(BUILD_META_KEY, EMPTY_BUILD_META);
    },
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.search.status(), status);
      queryClient.setQueryData(BUILD_META_KEY, {
        completedAt: new Date().toLocaleString("zh-CN"),
        error: "",
      });
    },
    onError: (error) => {
      queryClient.setQueryData(BUILD_META_KEY, {
        completedAt: "",
        error: getErrorMessage(error, "索引构建失败，请重试"),
      });
    },
  });
  const pendingBuilds = useMutationState({
    filters: { mutationKey: BUILD_MUTATION_KEY, status: "pending" },
  });

  const building = pendingBuilds.length > 0;
  return {
    status: statusQuery.data ?? null,
    loading: statusQuery.isFetching,
    building,
    error: statusQuery.error
      ? getErrorMessage(statusQuery.error, "无法读取索引状态")
      : metaQuery.data.error,
    completedAt: metaQuery.data.completedAt,
    refresh: () => {
      if (building) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.search.status() });
    },
    build: () => {
      if (statusQuery.isLoading || building) return;
      buildMutation.mutate();
    },
  };
}
