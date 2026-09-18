"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ItineraryPlaceInput } from "@tripforge/contracts";
import { Button, Input, Label } from "@tripforge/ui";

import { getMapTilerKey } from "@/lib/maps/config";
import {
  searchMapTilerPlaces,
  type PlaceSearchProximity,
  type PlaceSearchResult,
} from "@/lib/places/maptiler-geocoding";
import { placeSearchKeys } from "@/lib/places/query-keys";
import { useDebouncedValue } from "@/lib/places/use-debounced-value";

type PlaceSearchComboboxProps = Readonly<{
  disabled?: boolean;
  onChange: (place: ItineraryPlaceInput | null) => void;
  onSelectName?: (name: string) => void;
  proximity?: PlaceSearchProximity;
  selected: ItineraryPlaceInput | null;
}>;

export function PlaceSearchCombobox({
  disabled,
  onChange,
  onSelectName,
  proximity,
  selected,
}: PlaceSearchComboboxProps) {
  const id = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [changing, setChanging] = useState(!selected);
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const debouncedQuery = useDebouncedValue(searchText.trim());
  const isDebouncing =
    searchText.trim().length >= 3 && debouncedQuery !== searchText.trim();
  const key = getMapTilerKey();
  const canSearch = Boolean(key) && debouncedQuery.length >= 3;
  const query = useQuery({
    enabled: canSearch,
    gcTime: 5 * 60 * 1000,
    queryFn: ({ signal }) =>
      searchMapTilerPlaces({
        key: key!,
        proximity,
        query: debouncedQuery,
        signal,
      }),
    queryKey: placeSearchKeys.mapTiler(debouncedQuery, proximity),
    staleTime: 60 * 1000,
  });
  const results = canSearch && !isDebouncing ? (query.data?.results ?? []) : [];
  const listboxId = `${id}-listbox`;

  function selectResult(result: PlaceSearchResult) {
    onChange(result);
    onSelectName?.(result.name);
    setChanging(false);
    setIsOpen(false);
    setSearchText("");
  }

  if (selected && !changing) {
    return (
      <div className="space-y-2">
        <Label>Place (optional)</Label>
        <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <p className="break-words font-semibold">{selected.name}</p>
          {selected.address ? (
            <p className="mt-1 break-words text-sm text-[var(--muted-foreground)]">
              {selected.address}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={disabled}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => setChanging(true)}
            >
              Change
            </Button>
            <Button
              disabled={disabled}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                onChange(null);
                setChanging(true);
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const showList = isOpen && searchText.trim().length >= 3;

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-input`}>Place (optional)</Label>
      <div className="relative min-w-0">
        <Input
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showList}
          autoComplete="off"
          disabled={disabled || !key}
          id={`${id}-input`}
          placeholder="Search for a place"
          role="combobox"
          value={searchText}
          onBlur={() => setIsOpen(false)}
          onChange={(event) => {
            setActiveIndex(-1);
            setSearchText(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((index) => Math.min(index + 1, results.length - 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }
            if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
              event.preventDefault();
              selectResult(results[activeIndex]);
            }
          }}
        />

        {showList ? (
          <div
            className="absolute z-20 mt-1 max-h-72 w-full min-w-0 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
            id={listboxId}
            role="listbox"
          >
            {isDebouncing || query.isFetching ? (
              <p className="px-3 py-2 text-sm text-[var(--muted-foreground)]" role="status">
                Searching…
              </p>
            ) : query.isError ? (
              <p className="px-3 py-2 text-sm text-[var(--danger)]" role="status">
                Could not search places right now.
              </p>
            ) : query.data && results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--muted-foreground)]" role="status">
                No places found.
              </p>
            ) : (
              results.map((result, index) => (
                <button
                  aria-selected={activeIndex === index}
                  className={`block w-full min-w-0 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${
                    activeIndex === index ? "bg-[var(--surface-muted)]" : ""
                  }`}
                  id={`${id}-option-${index}`}
                  key={`${result.providerReference ?? "place"}-${index}`}
                  role="option"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                >
                  <span className="block truncate font-semibold">{result.name}</span>
                  {result.address ? (
                    <span className="block truncate text-[var(--muted-foreground)]">
                      {result.address}
                    </span>
                  ) : null}
                </button>
              ))
            )}
            {query.data ? <SearchAttribution /> : null}
          </div>
        ) : null}
      </div>

      {!key ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Place search is unavailable. You can still save this item.
        </p>
      ) : searchText.length > 0 && searchText.trim().length < 3 ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Enter at least 3 characters.
        </p>
      ) : null}

      {selected && changing ? (
        <Button
          disabled={disabled}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => {
            setChanging(false);
            setIsOpen(false);
            setSearchText("");
          }}
        >
          Keep current place
        </Button>
      ) : null}
    </div>
  );
}

function SearchAttribution() {
  return (
    <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
      Search by{" "}
      <a className="underline" href="https://www.maptiler.com/" rel="noreferrer" target="_blank">
        MapTiler
      </a>{" "}
      · ©{" "}
      <a
        className="underline"
        href="https://www.openstreetmap.org/copyright"
        rel="noreferrer"
        target="_blank"
      >
        OpenStreetMap contributors
      </a>
    </p>
  );
}
