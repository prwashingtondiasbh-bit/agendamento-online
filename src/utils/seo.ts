export interface StoreSeoConfig {
  title: string;
  description: string;
  canonicalPath?: string;
  storeName?: string;
  phone?: string;
  address?: string;
  openTime?: string;
  closeTime?: string;
  logoUrl?: string;
  noIndex?: boolean;
}

function setMetaTag(attrName: 'name' | 'property', attrValue: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function updateDocumentSeo(config: StoreSeoConfig) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const fullTitle = config.title.trim();
  const description = config.description.trim();
  const canonicalUrl =
    window.location.origin + (config.canonicalPath || window.location.pathname);

  document.title = fullTitle;

  setMetaTag('name', 'description', description);
  setMetaTag('name', 'robots', config.noIndex ? 'noindex, nofollow' : 'index, follow');

  // OpenGraph
  setMetaTag('property', 'og:title', fullTitle);
  setMetaTag('property', 'og:description', description);
  setMetaTag('property', 'og:url', canonicalUrl);
  setMetaTag('property', 'og:type', 'website');
  setMetaTag('property', 'og:site_name', config.storeName || 'Agenda Beauty');
  if (config.logoUrl) {
    setMetaTag('property', 'og:image', config.logoUrl);
  }

  // Twitter Card
  setMetaTag('name', 'twitter:card', 'summary_large_image');
  setMetaTag('name', 'twitter:title', fullTitle);
  setMetaTag('name', 'twitter:description', description);

  // Canonical Link
  let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.setAttribute('href', canonicalUrl);

  // Dynamic Schema.org JSON-LD for BeautySalon when viewing a store
  const dynamicScriptId = 'agenda-beauty-store-jsonld';
  let scriptEl = document.getElementById(dynamicScriptId) as HTMLScriptElement | null;

  if (config.storeName && !config.noIndex) {
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = dynamicScriptId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    const schemaData: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'BeautySalon',
      name: config.storeName,
      description,
      url: canonicalUrl,
      priceRange: '$$',
    };

    if (config.phone) {
      schemaData.telephone = config.phone;
    }
    if (config.address) {
      schemaData.address = {
        '@type': 'PostalAddress',
        streetAddress: config.address,
        addressCountry: 'BR',
      };
    }
    if (config.openTime && config.closeTime) {
      schemaData.openingHours = `Mo-Sa ${config.openTime}-${config.closeTime}`;
    }
    if (config.logoUrl) {
      schemaData.image = config.logoUrl;
    }

    scriptEl.textContent = JSON.stringify(schemaData);
  } else if (scriptEl) {
    scriptEl.remove();
  }
}
