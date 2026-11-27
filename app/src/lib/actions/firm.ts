// Ֆիրմայի կառավարում՝ ապրանքներ, աշխատողներ, խանութների պայմաններ, գծեր, խմբեր։
import type { ActionCtx, FirmActions } from '../store-types';
import { supabase } from '../supabase';
import { run } from './common';

export function firmActions(c: ActionCtx): FirmActions {
  const link = (shopId: string, firmId: string, patch: Record<string, unknown>) =>
    run(c, supabase.from('shop_firm_links').update(patch).eq('shop_id', shopId).eq('firm_id', firmId));
  const line = (lineId: string, patch: Record<string, unknown>) => run(c, supabase.from('lines').update(patch).eq('id', lineId));

  return {
    saveProduct: (p) => {
      const row = {
        firm_id: p.firmId,
        name: p.name,
        unit: p.unit,
        pack_note: p.packNote || null,
        price: p.price,
        min_qty: p.minQty,
        step: p.step,
        weighed: !!p.weighed,
        in_stock: p.inStock ?? true,
        image_url: p.imageUrl || null,
      };
      return run(c, p.id ? supabase.from('products').update(row).eq('id', p.id) : supabase.from('products').insert(row));
    },
    inviteEmployee: async (name, role, department, phone) => {
      const { data, error } = await supabase.rpc('invite_employee', { p_name: name, p_role: role, p_department: department, p_phone: phone });
      await c.reload();
      return error ? { error: error.message } : { code: data as string };
    },
    updateFirm: async (patch) => (c.me ? run(c, supabase.from('firms').update(patch).eq('id', c.me.firmId)) : 'Միայն ղեկավարը'),
    acceptRequest: async (shopId, lineId) => {
      const me = c.me;
      if (!me) return 'Մուտք գործեք որպես աշխատող';
      const current = c.links.find((l) => l.shopId === shopId && l.firmId === me.firmId);
      const managerId = me.role === 'manager' ? me.id : current?.managerId;
      if (!managerId) return 'Ընտրեք մենեջեր';
      return link(shopId, me.firmId, { status: 'active', manager_id: managerId, line_id: lineId });
    },
    confirmPayment: (paymentId) => run(c, supabase.from('payments').update({ confirmed_at: new Date().toISOString() }).eq('id', paymentId)),
    setLinkTerms: (shopId, firmId, discountPct, creditLimit) => link(shopId, firmId, { discount_pct: discountPct, credit_limit: creditLimit }),
    setLinkLine: (shopId, firmId, lineId) => link(shopId, firmId, { line_id: lineId }),
    setLinkManager: (shopId, firmId, managerId) => link(shopId, firmId, { manager_id: managerId }),
    setLineDriver: (lineId, driverId) => line(lineId, { driver_id: driverId }),
    setLineCutoff: (lineId, cutoff) => line(lineId, { order_cutoff: cutoff }),
    finishTextOrder: (id) => run(c, supabase.rpc('finish_text_order', { p_id: id })),
    toggleTeamMember: (teamId, employeeId) => {
      const inTeam = c.teams.find((x) => x.id === teamId)?.memberIds.includes(employeeId);
      const tm = supabase.from('team_members');
      return run(c, inTeam ? tm.delete().eq('team_id', teamId).eq('employee_id', employeeId) : tm.insert({ team_id: teamId, employee_id: employeeId }));
    },
  };
}
