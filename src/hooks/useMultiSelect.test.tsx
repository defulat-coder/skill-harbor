import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMultiSelect } from "./useMultiSelect";

interface Row {
  id: string;
  active: boolean;
}

const items: Row[] = [
  { id: "a", active: true },
  { id: "b", active: false },
  { id: "c", active: true },
];

function setup(filtered: Row[] = items) {
  return renderHook(() =>
    useMultiSelect<Row>({
      items,
      filtered,
      getKey: (row) => row.id,
      isItemActive: (row) => row.active,
    })
  );
}

describe("useMultiSelect", () => {
  it("starts with multi-select off and nothing selected", () => {
    const { result } = setup();
    expect(result.current.isMultiSelect).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isAllSelected).toBe(false);
  });

  it("toggles individual keys in and out of the selection", () => {
    const { result } = setup();
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.toggleSelect("c"));
    expect([...result.current.selectedIds].toSorted()).toEqual(["a", "c"]);
    act(() => result.current.toggleSelect("a"));
    expect([...result.current.selectedIds]).toEqual(["c"]);
  });

  it("selects all filtered rows, then clears on a second select-all", () => {
    const { result } = setup();
    act(() => result.current.handleSelectAll());
    expect(result.current.isAllSelected).toBe(true);
    expect(result.current.selectedIds.size).toBe(items.length);
    act(() => result.current.handleSelectAll());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("reports isAllSelected only against the filtered subset", () => {
    const filtered = items.filter((row) => row.id !== "c");
    const { result } = setup(filtered);
    act(() => result.current.handleSelectAll());
    expect([...result.current.selectedIds].toSorted()).toEqual(["a", "b"]);
    expect(result.current.isAllSelected).toBe(true);
  });

  it("never reports isAllSelected for an empty filtered list", () => {
    const { result } = setup([]);
    act(() => result.current.handleSelectAll());
    expect(result.current.isAllSelected).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("flags anyDisabled when a selected row is inactive", () => {
    const { result } = setup();
    act(() => result.current.toggleSelect("a"));
    expect(result.current.anyDisabled).toBe(false);
    act(() => result.current.toggleSelect("b"));
    expect(result.current.anyDisabled).toBe(true);
  });

  it("exitMultiSelect resets both the mode and the selection", () => {
    const { result } = setup();
    act(() => result.current.setIsMultiSelect(true));
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.exitMultiSelect());
    expect(result.current.isMultiSelect).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });
});
