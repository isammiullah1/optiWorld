import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OptiWorld',
    short_name: 'OptiWorld',
    description: 'Retailer billing that keeps working offline',
    start_url: '/retailer/dashboard',
    display: 'standalone',
    background_color: '#F5F7FB',
    theme_color: '#003153',
  };
}
