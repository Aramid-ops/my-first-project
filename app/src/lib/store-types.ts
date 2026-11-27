// Հավելվածի վիճակի տիպերը (store.tsx-ի և actions/*-ի ընդհանուր մասը)։
import type { Dispatch, SetStateAction } from 'react';

import type { Debt, DriverProfile, Employee, EmployeeRole, Firm, Issue, IssueKind, Line, Order, Payment, Product, SavedList, Shop, ShopFirmLink, Team } from './types';

export type Session =
  | { kind: 'shop'; shopId: string }
  | { kind: 'employee'; employeeId: string; role: EmployeeRole }
  | { kind: 'driverSelf' } // անկախ վարորդ (ֆիրմայի աշխատող չէ)
  | { kind: 'none' } // մուտք է գործել, բայց ոչ մի դերի կցված չէ
  | null;

/** Բազայից բեռնվող ամեն ինչը (նաև պահվում է հեռախոսում՝ առանց ինտերնետի համար) */
export interface Data {
  session: Session;
  firms: Firm[];
  employees: Employee[];
  shops: Shop[];
  links: ShopFirmLink[];
  products: Product[];
  orders: Order[];
  teams: Team[];
  lines: Line[];
  issues: Issue[];
  debts: Debt[];
  payments: Payment[];
  savedLists: SavedList[];
  driverProfile: DriverProfile | null;
  isPlatformAdmin: boolean;
  /** Խանութի անհատական գները՝ ըստ ապրանքի */
  prices: Record<string, number>;
}

export type Cart = Record<string, number>;

/** Այն, ինչ ստանում են գործողությունները (actions/*) */
export interface ActionCtx extends Data {
  /** Մուտք գործած աշխատողը (եթե աշխատող է) */
  me?: Employee;
  cart: Cart;
  setCart: Dispatch<SetStateAction<Cart>>;
  reload: () => Promise<void>;
}

type Result = Promise<string | null>; // null = հաջողվեց, այլապես՝ սխալի տեքստը

export interface OrderActions {
  setInvoice: (orderId: string, num: string) => Result;
  /** Մենեջերը ինքն է առաքում (երբ ֆիրման վարորդներ չունի հավելվածում) */
  setStatus: (orderId: string, status: 'on_the_way' | 'delivered') => Result;
  placeOrderForShop: (shopId: string, items: { productId: string; qty: number }[]) => Result;
  reportIssue: (orderId: string, productId: string, kind: IssueKind, qty: number | null, note: string, photoUrl?: string) => Result;
  /** Առաքման հաջորդ օրը՝ գծի օրերով և վերջնաժամով */
  deliveryDate: (link: ShopFirmLink) => Date;
  cutoffOf: (link: ShopFirmLink) => string | undefined;
  /** Փոխանցման թեկնածուներ. իմ խմբերի անդամները (ներքին աշխատողներ և վարորդներ), առաջարկվողները՝ առաջինը */
  forwardCandidates: (order: Order) => { employee: Employee; suggested: boolean }[];
  accept: (orderId: string) => Promise<void>;
  forward: (orderId: string, toEmployeeId: string) => Promise<void>;
  returnOrder: (orderId: string, reason: string) => Promise<void>;
}

export interface CartActions {
  cart: Cart;
  setQty: (productId: string, qty: number) => void;
  sendCart: () => Result;
  /** Ավելացնում է զամբյուղ, վերադարձնում՝ քանի ապրանք ավելացավ */
  repeatOrder: (order: Order) => number;
  applyList: (list: SavedList) => number;
  saveList: (name: string) => Result;
  deleteList: (id: string) => Promise<void>;
  /** Խանութի իրական գինը (զեղչով / անհատական) */
  priceOf: (p: Product) => number;
}

export interface ShopActions {
  requestJoin: (firmId: string) => Result;
  updateShop: (patch: Record<string, string>) => Result;
  markPaid: (firmId: string, amount: number, note: string) => Result;
}

export interface FirmActions {
  saveProduct: (p: Partial<Product> & { firmId: string }) => Result;
  inviteEmployee: (name: string, role: EmployeeRole, department: string, phone: string) => Promise<{ code?: string; error?: string }>;
  updateFirm: (patch: Record<string, unknown>) => Result;
  acceptRequest: (shopId: string, lineId: string | null) => Result;
  confirmPayment: (paymentId: string) => Result;
  setLinkTerms: (shopId: string, firmId: string, discountPct: number, creditLimit: number | null) => Result;
  setLinkLine: (shopId: string, firmId: string, lineId: string | null) => Result;
  setLinkManager: (shopId: string, firmId: string, managerId: string) => Result;
  setLineDriver: (lineId: string, driverId: string | null) => Result;
  setLineCutoff: (lineId: string, cutoff: string | null) => Result;
  toggleTeamMember: (teamId: string, employeeId: string) => Result;
}

export interface Store extends Omit<Data, 'prices'>, OrderActions, CartActions, ShopActions, FirmActions {
  ready: boolean;
  userEmail?: string;
  signIn: (email: string, password: string) => Result;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  acceptInvite: (code: string) => Promise<{ firm?: string; error?: string }>;
}
