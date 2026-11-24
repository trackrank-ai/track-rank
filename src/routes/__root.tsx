import { getSiteConfig } from "@/server/site-config";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  loader: () => getSiteConfig(),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Trackrank AI — AI visibility, in your hands",
      },
      {
        name: "description",
        content:
          "Independent, open-source AI visibility tracking. Track brand mentions, citations, and competitors using your own data provider account.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },

      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { googleTagManagerId } = Route.useLoaderData();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{document.documentElement.classList.toggle('dark',localStorage.getItem('trackrank-theme')==='dark')}catch(e){}})()` }} />
        {googleTagManagerId && <script dangerouslySetInnerHTML={{ __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
window.dataLayer.push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
(function(){var script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtm.js?id=${googleTagManagerId}';document.head.appendChild(script);})();` }} />}
        <HeadContent />
      </head>
      <body>
        {children}

        <Scripts />
      </body>
    </html>
  );
}
