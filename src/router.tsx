import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route, useLocation } from "react-router-dom";
import { lazy } from "react";
import App from "./App";
import { isTokenExpired, logout } from "./utils/session";

const Home = lazy(() => import('./pages/public/Home'));
const Login = lazy(() => import('./pages/public/Login'));
const Register = lazy(() => import('./pages/public/Register'));
const Profile = lazy(() => import('./pages/private/Profile'));
const Sync = lazy(() => import('./pages/private/Sync'));
const Scores = lazy(() => import('./pages/private/Scores'));
const Settings = lazy(() => import('./pages/private/Settings'));
const NotFound = lazy(() => import('./pages/public/NotFound'));

const ProtectedRoute = () => {
  const location = useLocation();

  if (isTokenExpired()) {
    logout();
    return <Navigate to="/login" state={{ from: location, expired: true }} replace />;
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
    <Route path="*" element={<NotFound />} />
  </Route>
);

export const router = createBrowserRouter(
  createRoutesFromElements(routesConfig)
)