import { lazy } from "react";
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from "react-router-dom";
import { checkPermission, isTokenExpired, isTokenUndefined, UserPermission } from "./utils/session";
import App from "./App";
import { useUserToken } from "@/hooks/swr/useUserToken.ts";

const Home = lazy(() => import('./pages/public/Home'));
const Login = lazy(() => import('./pages/public/Login'));
const Register = lazy(() => import('./pages/public/Register'));
const ForgotPassword = lazy(() => import('./pages/public/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/public/ResetPassword'));
const Docs = lazy(() => import('./pages/public/Docs.tsx'));
const YearInReview = lazy(() => import('./pages/public/YearInReview'));
const Profile = lazy(() => import('./pages/user/Profile/Profile.tsx'));
const Sync = lazy(() => import('./pages/user/Sync'));
const Scores = lazy(() => import('./pages/user/Scores'));
const Songs = lazy(() => import('./pages/user/Songs'));
const Plates = lazy(() => import('./pages/user/Plates'));
const Settings = lazy(() => import('./pages/user/Settings'));
const OAuthAuthorize = lazy(() => import('./pages/user/OAuth/Authorize.tsx'));
const NotFound = lazy(() => import('./pages/public/NotFound'));
const Vote = lazy(() => import('./pages/alias/Vote'));
const DeveloperApply = lazy(() => import('./pages/developer/Apply'));
const DeveloperInfo = lazy(() => import('./pages/developer/Info'));
const AdminPanel = lazy(() => import('./pages/admin/Panel'));

const ProtectedRoute = ({ extra_validation }: { extra_validation?: any }) => {
  const { mutate } = useUserToken();

  if (isTokenUndefined()) {
    return <Navigate to="/login" state={{
      redirect: window.location.pathname + window.location.search
    }} replace />;
  } else if (isTokenExpired()) {
    mutate();
  }
  if (extra_validation && !extra_validation()) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />
}

const routesConfig = (
  <Route element={<App />}>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/sync" element={<Sync />} />
    <Route path="/songs" element={<Songs />} />
    <Route path="/plates" element={<Plates />} />
    <Route path="/docs/*" element={<Docs />} />
    <Route path="/year-in-review/2024/*" element={<YearInReview />} />
    <Route path="/user/sync" element={<Sync />} />
    <Route path="/user" element={<ProtectedRoute />}>
      <Route index element={<Home />} />
      <Route path="profile" element={<Profile />} />
      <Route path="scores" element={<Scores />} />
      <Route path="settings" element={<Settings />} />
    </Route>
    <Route path="/oauth" element={<ProtectedRoute />}>
      <Route path="authorize" element={<OAuthAuthorize />} />
    </Route>
    <Route path="/alias" element={<ProtectedRoute />}>
      <Route index element={<Home />} />
      <Route path="vote" element={<Vote />} />
    </Route>
    <Route path="/developer" element={<ProtectedRoute />}>
      <Route path="apply" element={<DeveloperApply />} />
      <Route path="" element={<DeveloperInfo />} />
    </Route>
    <Route path="/admin" element={<ProtectedRoute extra_validation={
      () => checkPermission(UserPermission.Administrator)}
    />}>
      <Route path="panel" element={<AdminPanel />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Route>
);

export const router = createBrowserRouter(
  createRoutesFromElements(routesConfig)
)