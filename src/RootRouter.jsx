import App from "./App.jsx";
import AuthCallback from "./AuthCallback.jsx";
import Clients from "./Clients.jsx";
import History from "./History.jsx";
import Landing from "./Landing.jsx";
import Onboarding from "./Onboarding.jsx";
import { usePathname } from "./router.js";

const routes = {
  "/auth/callback": AuthCallback,
  "/clients": Clients,
  "/dashboard": App,
  "/history": History,
  "/onboarding": Onboarding,
  "/settings": App,
};

function RootRouter() {
  const pathname = usePathname();
  const RootComponent = routes[pathname] ?? Landing;

  return <RootComponent />;
}

export default RootRouter;
