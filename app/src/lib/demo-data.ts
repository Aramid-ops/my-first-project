// ՓՈՐՁՆԱԿԱՆ տվյալներ (demo)։ Անուններն ու գները հորինված են։
// Երբ Supabase-ը միացվի, այս տվյալները կգան բազայից։
import type { Employee, Firm, Product, Shop, ShopFirmLink } from './types';

export const firms: Firm[] = [
  { id: 'f-aten', name: 'Աթենք', category: 'Ըմպելիք և տնտեսական', color: { bg: '#E2E8F4', fg: '#2C4A8A' } },
  { id: 'f-kat', name: 'Կաթնաշխարհ', category: 'Կաթնամթերք', color: { bg: '#E3EEF0', fg: '#1D4E5A' } },
  { id: 'f-hac', name: 'Հացատուն', category: 'Հաց և խմորեղեն', color: { bg: '#F3E9D8', fg: '#7A5214' } },
];

export const employees: Employee[] = [
  { id: 'e-karen', firmId: 'f-aten', name: 'Կարեն', role: 'manager', defaultForwardToId: 'e-ani', phone: '+37400000001' },
  { id: 'e-samo', firmId: 'f-aten', name: 'Սամո', role: 'manager', defaultForwardToId: 'e-ani' },
  { id: 'e-ani', firmId: 'f-aten', name: 'Անի', role: 'staff', department: 'Առաքման բաժին' },
  { id: 'e-gagik', firmId: 'f-aten', name: 'Գագիկ', role: 'staff', department: 'Պահեստ' },
  { id: 'e-artur', firmId: 'f-aten', name: 'Արթուր', role: 'driver' },
  { id: 'e-lilit', firmId: 'f-kat', name: 'Լիլիթ', role: 'manager' },
  { id: 'e-tigran', firmId: 'f-hac', name: 'Տիգրան', role: 'manager' },
];

export const shops: Shop[] = [
  {
    id: 's-ket',
    name: 'Սրճարան «Կետ»',
    taxId: '00000000',
    city: 'Երևան',
    district: 'Աջափնյակ',
    address: 'փորձնական հասցե',
  },
];

export const links: ShopFirmLink[] = [
  { shopId: 's-ket', firmId: 'f-aten', managerId: 'e-karen', status: 'active', deliveryDays: [1, 4] },
  { shopId: 's-ket', firmId: 'f-kat', managerId: 'e-lilit', status: 'active', deliveryDays: [] },
  { shopId: 's-ket', firmId: 'f-hac', managerId: 'e-tigran', status: 'active', deliveryDays: [] },
];

export const products: Product[] = [
  { id: 'p1', firmId: 'f-aten', name: 'Զուգարանի թուղթ, 3 շերտ', unit: 'հատ', packNote: '1 բլոկ = 30 հատ', price: 150, minQty: 30, step: 30, inStock: true },
  { id: 'p2', firmId: 'f-aten', name: 'Հեղուկ օճառ, 500 մլ', unit: 'հատ', packNote: '1 արկղ = 12 հատ', price: 600, minQty: 12, step: 12, inStock: true },
  { id: 'p3', firmId: 'f-aten', name: 'Հանքային ջուր, 0.5 լ', unit: 'հատ', packNote: '1 տուփ = 12 հատ', price: 180, minQty: 12, step: 12, inStock: true },
  { id: 'p4', firmId: 'f-aten', name: 'Անձեռոցիկ, 100 հատ', unit: 'տուփ', packNote: '1 բլոկ = 24 տուփ', price: 250, minQty: 24, step: 24, inStock: false },
  { id: 'p5', firmId: 'f-kat', name: 'Կաթ 3.2%, 1 լ', unit: 'հատ', price: 520, minQty: 6, step: 6, inStock: true },
  { id: 'p6', firmId: 'f-kat', name: 'Պանիր լոռի', unit: 'կգ', price: 3200, minQty: 1, step: 0.5, weighed: true, inStock: true },
  { id: 'p7', firmId: 'f-kat', name: 'Թան, 0.5 լ', unit: 'հատ', price: 300, minQty: 6, step: 6, inStock: true },
  { id: 'p8', firmId: 'f-hac', name: 'Լավաշ', unit: 'հատ', price: 120, minQty: 10, step: 5, inStock: true },
  { id: 'p9', firmId: 'f-hac', name: 'Մատնաքաշ', unit: 'հատ', price: 250, minQty: 5, step: 5, inStock: true },
];
