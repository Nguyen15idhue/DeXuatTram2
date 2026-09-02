export const PROVINCES = [
  // Trung du va mien nui phia Bac
  { name: 'Tuyen Quang', lat: 22.1200, lng: 105.2400, region: 'north' },
  { name: 'Cao Bang', lat: 22.6700, lng: 106.2500, region: 'north' },
  { name: 'Lai Chau', lat: 22.3900, lng: 103.4500, region: 'north' },
  { name: 'Lao Cai', lat: 22.3400, lng: 104.1700, region: 'north' },
  { name: 'Thai Nguyen', lat: 21.6000, lng: 105.8400, region: 'north' },
  { name: 'Dien Bien', lat: 21.4100, lng: 103.0200, region: 'north' },
  { name: 'Lang Son', lat: 21.8500, lng: 106.7500, region: 'north' },
  { name: 'Son La', lat: 21.3300, lng: 104.1700, region: 'north' },
  { name: 'Phu Tho', lat: 21.3200, lng: 105.2200, region: 'north' },
  { name: 'Bac Ninh', lat: 21.2200, lng: 106.2000, region: 'north' },

  // Dong bang song Hong
  { name: 'Ha Noi', lat: 21.0300, lng: 105.8500, region: 'north' },
  { name: 'Quang Ninh', lat: 21.0000, lng: 107.3000, region: 'north' },
  { name: 'Hai Phong', lat: 20.8600, lng: 106.6800, region: 'north' },
  { name: 'Hung Yen', lat: 20.7800, lng: 106.1800, region: 'north' },
  { name: 'Ninh Binh', lat: 20.2500, lng: 105.9700, region: 'north' },

  // Bac Trung Bo
  { name: 'Thanh Hoa', lat: 19.8100, lng: 105.4700, region: 'north-central' },
  { name: 'Nghe An', lat: 19.2300, lng: 104.9200, region: 'north-central' },
  { name: 'Ha Tinh', lat: 18.3400, lng: 105.9100, region: 'north-central' },
  { name: 'Quang Tri', lat: 16.7500, lng: 107.0000, region: 'north-central' },
  { name: 'Thua Thien - Hue', lat: 16.4600, lng: 107.5800, region: 'north-central' },

  // Duyen hai Nam Trung Bo & Tay Nguyen
  { name: 'Da Nang', lat: 16.0500, lng: 108.2000, region: 'south-central' },
  { name: 'Quang Ngai', lat: 15.1200, lng: 108.8000, region: 'south-central' },
  { name: 'Gia Lai', lat: 13.9800, lng: 108.0000, region: 'south-central' },
  { name: 'Dak Lak', lat: 12.7000, lng: 108.0500, region: 'south-central' },
  { name: 'Khanh Hoa', lat: 12.2500, lng: 109.0900, region: 'south-central' },
  { name: 'Lam Dong', lat: 11.9400, lng: 108.4400, region: 'south-central' },

  // Dong Nam Bo
  { name: 'TP. Ho Chi Minh', lat: 10.8200, lng: 106.6300, region: 'southeast' },
  { name: 'Dong Nai', lat: 11.0200, lng: 107.1700, region: 'southeast' },
  { name: 'Tay Ninh', lat: 11.3100, lng: 106.1000, region: 'southeast' },

  // Dong bang song Cuu Long
  { name: 'Dong Thap', lat: 10.5900, lng: 105.6800, region: 'mekong' },
  { name: 'Vinh Long', lat: 10.2400, lng: 105.9600, region: 'mekong' },
  { name: 'An Giang', lat: 10.5200, lng: 105.1700, region: 'mekong' },
  { name: 'Can Tho', lat: 10.0500, lng: 105.7700, region: 'mekong' },
  { name: 'Ca Mau', lat: 9.1800, lng: 105.1500, region: 'mekong' }
];

export const PROVINCE_REGIONS = [
  { id: 'north', label: 'Trung du va mien nui phia Bac', color: '#2196F3' },
  { id: 'north-central', label: 'Bac Trung Bo', color: '#FF9800' },
  { id: 'south-central', label: 'Duyen hai Nam Trung Bo & Tay Nguyen', color: '#4CAF50' },
  { id: 'southeast', label: 'Dong Nam Bo', color: '#9C27B0' },
  { id: 'mekong', label: 'Dong bang song Cuu Long', color: '#00BCD4' }
];

export const VIETNAM_CENTER = { lat: 16.0, lng: 108.0 };
export const VIETNAM_DEFAULT_ZOOM = 6;
