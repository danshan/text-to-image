import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { ApiClient } from "../api/client";
import { useApiResource } from "../hooks/use-api-resource";
import { useTheme } from "../hooks/use-theme";
import { Link, navigate, type BrowserLocation } from "../router";
import { parseGalleryQuery, serializeGalleryQuery } from "../state/gallery-query";
import type { WebBootstrap } from "../types";
import { GridIcon, ImageIcon, SearchIcon, SettingsIcon, StackIcon, WrenchIcon } from "./icons";
import { HealthBadge } from "./status";

const navItems = [
  { to: "/gallery", label: "Gallery", index: "01", icon: GridIcon },
  { to: "/references", label: "References", index: "02", icon: ImageIcon },
  { to: "/creations", label: "Creations", index: "03", icon: StackIcon },
  { to: "/recovery", label: "Recovery", index: "04", icon: WrenchIcon },
  { to: "/settings", label: "Settings", index: "05", icon: SettingsIcon },
];

export function AppShell({
  api,
  bootstrap,
  location,
  children,
}: {
  api: ApiClient;
  bootstrap: WebBootstrap;
  location: BrowserLocation;
  children: ReactNode;
}) {
  const health = useApiResource("health", (signal) => api.health(signal));
  const { preference, setPreference } = useTheme();
  const [search, setSearch] = useState(() => parseGalleryQuery(location.search).q);
  const [searchDirty, setSearchDirty] = useState(false);

  useEffect(() => {
    if (location.pathname === "/gallery") setSearch(parseGalleryQuery(location.search).q);
    setSearchDirty(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!searchDirty) return undefined;
    const timer = window.setTimeout(() => {
      const query =
        location.pathname === "/gallery"
          ? parseGalleryQuery(location.search)
          : parseGalleryQuery("");
      navigate(`/gallery${serializeGalleryQuery({ ...query, q: search, cursor: "" })}`);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search, search, searchDirty]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearchDirty(false);
    const query =
      location.pathname === "/gallery" ? parseGalleryQuery(location.search) : parseGalleryQuery("");
    navigate(`/gallery${serializeGalleryQuery({ ...query, q: search, cursor: "" })}`);
  };

  const healthStatus =
    health.data?.status ?? (health.status === "error" ? "unavailable" : "indexing");
  const libraryName = bootstrap.libraryName ?? "Image Workspace";

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Library navigation">
        <div className="sidebar-heading">
          <div>
            <span className="brand-index">LOCAL / 01</span>
            <strong>{libraryName}</strong>
          </div>
        </div>
        <nav>
          <ol className="primary-nav">
            {navItems.map((item) => {
              const active =
                location.pathname === item.to ||
                (item.to !== "/gallery" && location.pathname.startsWith(`${item.to}/`));
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link to={item.to} className={active ? "nav-link nav-link--active" : "nav-link"}>
                    <span className="nav-number">{item.index}</span>
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-caption">Library status</span>
          <HealthBadge status={healthStatus} />
          <span className="sidebar-caption">Theme</span>
          <div
            className="segmented-control segmented-control--compact"
            aria-label="Theme preference"
          >
            {(["system", "light", "dark"] as const).map((theme) => (
              <button
                key={theme}
                className="theme-option"
                aria-pressed={preference === theme}
                onClick={() => setPreference(theme)}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <form className="global-search" role="search" onSubmit={submitSearch}>
            <label htmlFor="global-search">Search prompts, titles, tags and notes</label>
            <SearchIcon />
            <input
              id="global-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchDirty(true);
              }}
              placeholder="Search the archive"
              autoComplete="off"
            />
            <kbd>Enter</kbd>
          </form>
          <HealthBadge status={healthStatus} />
        </header>
        {health.data && health.data.status !== "healthy" && (
          <div className={`health-notice health-notice--${health.data.status}`} role="status">
            <strong>{health.data.status.replaceAll("_", " ")}</strong>
            <span>
              {health.data.status === "indexing"
                ? `Index lag: ${health.data.index.lagCount} commits.`
                : health.data.diagnostics.join(" ") ||
                  "The library is available with reduced capabilities."}
            </span>
            {health.data.status === "degraded" && <Link to="/settings">View diagnostics</Link>}
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
