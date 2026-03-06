import { useEffect } from "react";
import App from "./App.jsx";
import AuthCallback from "./AuthCallback.jsx";
import Clients from "./Clients.jsx";
import Landing from "./Landing.jsx";
import Onboarding from "./Onboarding.jsx";
import { navigate, usePathname } from "./router.js";

function RootRouter() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/settings") {
      navigate("/dashboard", { replace: true });
    }
  }, [pathname]);

  const activePath = pathname === "/settings" ? "/dashboard" : pathname;
  const RootComponent =
    activePath === "/dashboard"
      ? App
      : activePath === "/clients"
        ? Clients
        : activePath === "/auth/callback"
          ? AuthCallback
          : activePath === "/onboarding"
            ? Onboarding
            : Landing;

  return <RootComponent />;
}

export default RootRouter;
