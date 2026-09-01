'use client';

type FilterOption = { value: string; label: string };

export function AdminSearchToolbar({
  query,
  onQueryChange,
  placeholder,
  filterValue,
  onFilterChange,
  filterOptions,
  resultCount,
  resultLabel = 'kết quả',
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: FilterOption[];
  resultCount?: number;
  resultLabel?: string;
}) {
  return (
    <div className="admin-search-toolbar">
      <div className="admin-search-toolbar-input">
        <span aria-hidden="true">🔍</span>
        <input
          placeholder={placeholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <div className="admin-search-toolbar-trailing">
        {filterOptions && onFilterChange && (
          <select
            className="admin-search-toolbar-filter"
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
          >
            {filterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}

        <button type="button" className="admin-search-toolbar-btn">🔍 Tìm kiếm</button>

        {typeof resultCount === 'number' && (
          <span className="badge badge-neutral admin-search-toolbar-count">{resultCount} {resultLabel}</span>
        )}
      </div>
    </div>
  );
}
