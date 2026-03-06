import { useEffect, useState } from "react";

export function navigate(path, options = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const nextPath = path || "/";
  const currentPath = window.location.pathname;

  if (currentPath === nextPath && !options.replace) {
    return;
  }

  const method = options.replace ? "replaceState" : "pushState";
  window.history[method]({}, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => {
    if (typeof window === "undefined") {
      return "/";
    }

    return window.location.pathname;
  });

  useEffect(() => {
    const handlePathChange = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", handlePathChange);

    return () => {
      window.removeEventListener("popstate", handlePathChange);
    };
  }, []);

  return pathname;
}
