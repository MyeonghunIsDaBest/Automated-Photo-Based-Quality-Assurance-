// pages/sales/Sales.tsx — legacy redirect shell.
//
// Sales dissolved into standalone areas (Quotes / Invoices / Catalogue). This
// shell keeps the /sales route alive so every old bookmark and in-app deep-link
// (/sales?tab=…) forwards to its new home instead of 404-ing.

import { Navigate, useSearchParams } from 'react-router-dom';

export default function Sales() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  const customer = params.get('customer');
  const quote = params.get('quote');
  const newJob = params.get('newJob');
  const cat = params.get('cat');

  const qs = (obj: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : '';
  };

  let to = '/quotes';
  switch (tab) {
    case 'invoices':
      to = `/invoices${qs({ customer })}`;
      break;
    case 'variations':
      to = `/invoices${qs({ view: 'variations', newJob })}`;
      break;
    case 'catalogue':
      to = `/catalogue${qs({ cat })}`;
      break;
    case 'settings':
      to = '/quotes?view=settings';
      break;
    case 'quotes':
    default:
      // The old ?type= Service/Project segment is owned internally by the hub
      // now, so it isn't carried; customer + quote deep-links are.
      to = `/quotes${qs({ customer, quote })}`;
      break;
  }

  return <Navigate to={to} replace />;
}
