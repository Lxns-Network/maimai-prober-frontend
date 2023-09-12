import { lazy } from "react";
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route } from "react-router-dom";
import { checkPermission, isTokenExpired, logout, UserPermission } from "./utils/session";
import { refreshToken } from "./utils/api/api";
import App from "./App";

const Home = lazy(() => import('./pages/public/Home'));
const Login = lazy(() => import('./pages/public/Login'));
const Register = lazy(() => import('./pages/public/Register'));
const Profile = lazy(() => import('./pages/user/Profile'));
const Sync = lazy(() => import('./pages/user/Sync'));
const Scores = lazy(() => import('./pages/user/Scores'));
const Settings = lazy(() => import('./pages/user/Settings'));
const NotFound = lazy(() => import('./pages/public/NotFound'));
const DeveloperApply = lazy(() => import('./pages/developer/Apply'));
const Users = lazy(() => import('./pages/admin/Users'));

const ProtectedRoute = ({ extra_validation }: { extra_validation?: any }) => {
  if (isTokenExpired()) {
    // 如果 token 过期，刷新 token
    refreshToken().then((result) => {
      if (!result) {
        logout();
        return <Navigate to="/login" state={{ from: location, expired: true }} replace />;
      } else {
        window.location.reload();
      }
    });
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
    <Route path="/user" element={<ProtectedRoute />}>
      <Route index element={<Home />} />
      <Route path="profile" element={<Profile />} />
      <Route path="sync" element={<Sync />} />
      <Route path="scores" element={<Scores />} />
      <Route path="settings" element={<Settings />} />
    </Route>
    <Route path="/developer" element={<ProtectedRoute />}>
      <Route path="apply" element={<DeveloperApply />} />
    </Route>
    <Route path="/admin" element={<ProtectedRoute extra_validation={
      () => checkPermission(UserPermission.Administrator)}
    />}>
      <Route path="users" element={<Users />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Route>
);

export const router = createBrowserRouter(
  createRoutesFromElements(routesConfig)
)