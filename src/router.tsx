import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route, useLocation } from "react-router-dom";
import Home from "./pages/public/Home";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import Profile, { profileLoader } from "./pages/private/Profile";
import Sync from "./pages/private/Sync";
import Scores, { scoresLoader } from "./pages/private/Scores";
import Settings from "./pages/private/Settings";
import NotFound from "./pages/public/NotFound";
import App from "./App";

const ProtectedRoute = () => {
  const location = useLocation();

  return localStorage.getItem('token')
    ? <Outlet />
    : <Navigate to="/login" state={{ from: location }} replace />;
}

const routesConfig = (
  <Route element={<App />}>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/user" element={<ProtectedRoute />}>
      <Route index element={<Home />} />
      <Route path="profile" element={<Profile />} loader={profileLoader} />
      <Route path="sync" element={<Sync />} />
      <Route path="scores" element={<Scores />} loader={scoresLoader} />
      <Route path="settings" element={<Settings />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Route>
);

export const router = createBrowserRouter(
  createRoutesFromElements(routesConfig)
)