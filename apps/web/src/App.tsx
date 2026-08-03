import { useEffect, useMemo } from "react";
import { ApiClient, loadBootstrap } from "./api/client";
import { AppShell } from "./components/app-shell";
import { ErrorState, LibraryInitializationState, LoadingState } from "./components/states";
import { useApiResource } from "./hooks/use-api-resource";
import { CreationDetailPage } from "./pages/creation-detail-page";
import { CreationsPage } from "./pages/creations-page";
import { GalleryPage } from "./pages/gallery-page";
import { GenerationDetailPage } from "./pages/generation-detail-page";
import { ImageDetailPage } from "./pages/image-detail-page";
import { NotFoundPage } from "./pages/not-found-page";
import { RecoveryPage } from "./pages/recovery-page";
import { ReferencesPage } from "./pages/references-page";
import { SettingsPage } from "./pages/settings-page";
import { navigate, useBrowserLocation } from "./router";
import type { WebBootstrap } from "./types";

export default function App() {
  const location = useBrowserLocation();
  const bootstrap = useApiResource("bootstrap", (signal) => loadBootstrap(signal));
  const api = useMemo(
    () =>
      bootstrap.data && !bootstrap.data.initialization ? new ApiClient(bootstrap.data) : undefined,
    [bootstrap.data],
  );

  useEffect(() => {
    if (location.pathname === "/") navigate("/gallery", { replace: true });
  }, [location.pathname]);

  if (location.pathname === "/") return null;
  if (bootstrap.status === "loading" && !bootstrap.data) {
    return (
      <main className="bootstrap-screen">
        <LoadingState label="Opening the local Library" />
      </main>
    );
  }
  if (bootstrap.status === "error") {
    return (
      <main className="bootstrap-screen">
        <ErrorState error={bootstrap.error} onRetry={bootstrap.reload} />
      </main>
    );
  }
  if (bootstrap.data?.initialization) {
    return (
      <main className="bootstrap-screen">
        <LibraryInitializationState initialization={bootstrap.data.initialization} />
      </main>
    );
  }
  if (!bootstrap.data || !api) return null;

  return (
    <AppShell api={api} bootstrap={bootstrap.data} location={location}>
      <RouteContent
        api={api}
        pathname={location.pathname}
        search={location.search}
        bootstrap={bootstrap.data}
      />
    </AppShell>
  );
}

function RouteContent({
  api,
  pathname,
  search,
  bootstrap,
}: {
  api: ApiClient;
  pathname: string;
  search: string;
  bootstrap: WebBootstrap;
}) {
  if (pathname === "/gallery") return <GalleryPage api={api} search={search} />;
  if (pathname === "/references") return <ReferencesPage api={api} search={search} />;
  if (pathname === "/creations") return <CreationsPage api={api} search={search} />;
  if (pathname === "/recovery") return <RecoveryPage api={api} />;
  if (pathname === "/settings") return <SettingsPage api={api} bootstrap={bootstrap} />;

  const creationMatch = pathname.match(/^\/creations\/([^/]+)$/);
  const creationId = creationMatch?.[1];
  if (creationId) return <CreationDetailPage api={api} creationId={safeDecode(creationId)} />;
  const imageMatch = pathname.match(/^\/images\/([a-fA-F0-9]{64})$/);
  const sha256 = imageMatch?.[1];
  if (sha256) return <ImageDetailPage api={api} sha256={sha256.toLowerCase()} />;
  const generationMatch = pathname.match(/^\/generations\/([^/]+)$/);
  const generationId = generationMatch?.[1];
  if (generationId)
    return <GenerationDetailPage api={api} generationId={safeDecode(generationId)} />;
  return <NotFoundPage />;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
