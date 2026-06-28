import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DatabaseProvider } from "@/context/database-context";
import { ThemeProvider } from "@/context/theme-context";
import { AuthProvider } from "@/context/auth-context";
import BrowserProtocolGuard from "@/components/browser-protocol-guard";
import { BrandingHeadSync } from "@/components/branding-head-sync";
import { CompanyThemeSync } from "@/components/company-theme-sync";
import PWARegister from "@/components/pwa-register";
import { PWAInstallProvider } from "@/components/pwa-install-provider";
import { StoreCustomerProvider } from "@/context/store-customer-context";
import { StorePrivacyProvider } from "@/context/store-privacy-context";
import { StoreCookieBanner } from "@/components/store/StoreCookieBanner";

const companyHeadBootScript = `
(function () {
  try {
    var raw = window.localStorage && window.localStorage.getItem('printflow_company');
    var company = raw ? JSON.parse(raw) : null;
    var host = window.location.hostname.replace(/^www\\./, '').toLowerCase();
    var hostParts = host.split('.').filter(Boolean);
    var hostBrand = '';

    if (hostParts.length >= 2 && (hostParts[0] === 'admin' || hostParts[0] === 'store')) {
      hostBrand = hostParts[1].replace(/-/g, ' ').toUpperCase();
    }

    var companyName = company && typeof company.name === 'string' && company.name.trim()
      ? company.name.trim()
      : hostBrand;
    var isStore = window.location.pathname === '/store' ||
      window.location.pathname.indexOf('/store/') === 0 ||
      hostParts[0] === 'store';

    if (companyName) {
      document.title = (isStore ? 'Catálogo - ' : 'Dashboard - ') + companyName;
    }

    var favicon = company && typeof company.favicon === 'string' ? company.favicon.trim() : '';
    var logo = company && (
      (typeof company.logo_light === 'string' && company.logo_light.trim()) ||
      (typeof company.logo_url === 'string' && company.logo_url.trim()) ||
      (typeof company.logo_dark === 'string' && company.logo_dark.trim())
    );
    var icon = favicon || logo || '/api/public/branding/icon?size=192&v=boot';

    var lower = icon.toLowerCase();
    var supported = !lower.endsWith('.cdr') && (
      lower.indexOf('http') === 0 ||
      lower.indexOf('/') === 0 ||
      lower.indexOf('data:image/') === 0 ||
      /\\.(png|ico|svg|jpg|jpeg|webp)(\\?|#|$)/.test(lower)
    );

    if (!supported) return;

    var absoluteFavicon = new URL(icon, window.location.href).href;
    var links = document.querySelectorAll("link[rel*='icon']");

    if (!links.length) {
      var link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
      links = [link];
    }

    Array.prototype.forEach.call(links, function (link) {
      if (link.href !== absoluteFavicon) link.href = absoluteFavicon;
    });
  } catch (error) {
    // Keep the default metadata if browser storage is unavailable.
  }
})();
`;

const developmentPwaCleanupBootScript = process.env.NODE_ENV === 'production' ? '' : `
(function () {
  try {
    var host = window.location.hostname;
    var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocal) return;

    var cleanup = [];

    if ('serviceWorker' in navigator) {
      cleanup.push(
        navigator.serviceWorker.getRegistrations()
          .then(function (registrations) {
            return Promise.all(registrations.map(function (registration) {
              return registration.unregister();
            }));
          })
      );
    }

    if ('caches' in window) {
      cleanup.push(
        window.caches.keys()
          .then(function (cacheNames) {
            return Promise.all(cacheNames.map(function (cacheName) {
              return window.caches.delete(cacheName);
            }));
          })
      );
    }

    if (!cleanup.length) return;

    Promise.all(cleanup).then(function () {
      if (navigator.serviceWorker && navigator.serviceWorker.controller && !window.sessionStorage.getItem('printflow_dev_sw_cleanup')) {
        window.sessionStorage.setItem('printflow_dev_sw_cleanup', '1');
        window.location.reload();
      }
    }).catch(function () {});
  } catch (error) {}
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://admin.cibeleprint.com.br"),
  title: "Dashboard - CibelePRINT",
  description: "O ERP definitivo para controle de custos, precificação m², ordens de produção Kanban e gestão financeira de gráficas, brindes, sublimação e comunicação visual.",
  manifest: "/manifest.webmanifest",
  applicationName: "Dashboard - CibelePRINT",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dashboard",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/api/public/branding/icon?size=192&v=initial",
    shortcut: "/api/public/branding/icon?size=192&v=initial",
    apple: "/api/public/branding/icon?size=192&v=initial",
  },
  openGraph: {
    title: "Dashboard - CibelePRINT",
    description: "ERP SaaS para graficas e comunicacao visual.",
    images: ["/api/public/branding/icon?size=512&v=initial"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1D35C9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="light" suppressHydrationWarning>
      <head>
        {developmentPwaCleanupBootScript && (
          <script dangerouslySetInnerHTML={{ __html: developmentPwaCleanupBootScript }} />
        )}
        <script dangerouslySetInnerHTML={{ __html: companyHeadBootScript }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <PWAInstallProvider>
          <PWARegister />
          <BrowserProtocolGuard />
          <ThemeProvider>
            <AuthProvider>
              <DatabaseProvider>
                <StoreCustomerProvider>
                  <StorePrivacyProvider>
                    <CompanyThemeSync />
                    <BrandingHeadSync />
                    {children}
                    <StoreCookieBanner />
                  </StorePrivacyProvider>
                </StoreCustomerProvider>
              </DatabaseProvider>
            </AuthProvider>
          </ThemeProvider>
        </PWAInstallProvider>
      </body>
    </html>
  );
}
