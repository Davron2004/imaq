import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, useParams } from "react-router";
import { RouterProvider } from "react-router/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { currentVillageId } from "../data/village";

const Hub = lazy(() => import("../screens/hub/HubScreen"));
const Resident = lazy(() => import("../screens/resident/ResidentScreen"));
const ResidentEntry = lazy(() => import("../screens/resident/ResidentEntry"));
const Driver = lazy(() => import("../screens/driver/DriverScreen"));
const Office = lazy(() => import("../screens/office/OfficeScreen"));
const Sim = lazy(() => import("../screens/sim/SimScreen"));
const Qr = lazy(() => import("../screens/qr/QrScreen"));
const Stage = lazy(() => import("../screens/stage/StageScreen"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 1000 } },
});

/** `/driver` → `/v/<current village>/driver`, and so on. */
function ToVillage({ page }: { page: string }) {
  return <Navigate to={`/v/${currentVillageId()}/${page}`} replace />;
}

function Loading() {
  return <p className="app-loading">Loading…</p>;
}

function VillageGuard({ children }: { children: React.ReactNode }) {
  const { villageId } = useParams();
  if (!villageId) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const router = createBrowserRouter([
  { path: "/", element: <Hub /> },
  { path: "/h/:token", element: <Resident /> },
  { path: "/resident", element: <ResidentEntry /> },
  { path: "/sim", element: <Sim /> },
  { path: "/driver", element: <ToVillage page="driver" /> },
  { path: "/office", element: <ToVillage page="office" /> },
  { path: "/qr", element: <ToVillage page="qr" /> },
  { path: "/stage", element: <ToVillage page="stage" /> },
  { path: "/v/:villageId/driver/*", element: <VillageGuard><Driver /></VillageGuard> },
  { path: "/v/:villageId/office", element: <VillageGuard><Office /></VillageGuard> },
  { path: "/v/:villageId/qr", element: <VillageGuard><Qr /></VillageGuard> },
  { path: "/v/:villageId/stage", element: <VillageGuard><Stage /></VillageGuard> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Loading />}>
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  );
}
