import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { pathname } = new URL(req.url);
  const action = pathname.split('/').pop();

  // Special: init-admin - requires ADMIN_INIT_SECRET, only works if no admin exists yet
  if (action === 'init-admin') {
    const body = await req.json();
    const { secret, email, password } = body;

    const initSecret = Deno.env.get('ADMIN_INIT_SECRET');
    if (!initSecret || secret !== initSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { count } = await supabaseAdmin
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (count && count > 0) {
      return new Response(JSON.stringify({ error: 'Admin already exists' }), { status: 400, headers: corsHeaders });
    }

    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      console.error('init-admin error:', createErr);
      return new Response(JSON.stringify({ error: 'Failed to create admin' }), { status: 400, headers: corsHeaders });
    }

    await supabaseAdmin.from('user_roles').upsert({ user_id: newUser.user!.id, role: 'admin' });
    await supabaseAdmin.from('user_access').upsert({ user_id: newUser.user!.id, status: 'active' });
    await supabaseAdmin.from('profiles').upsert({ id: newUser.user!.id, name: 'Admin', email });

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  // All other actions require authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  // check-access: any authenticated user can check their own access
  if (action === 'check-access') {
    const { data: access } = await supabaseAdmin
      .from('user_access')
      .select('status, subscription_end, sb2_unlocked, sb3_unlocked, sb4_unlocked, sb5_unlocked')
      .eq('user_id', user.id)
      .single();

    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (adminRole) return new Response(JSON.stringify({ allowed: true, role: 'admin', sb2_unlocked: true, sb3_unlocked: true, sb4_unlocked: true, sb5_unlocked: true }), { headers: corsHeaders });

    if (!access || access.status !== 'active') {
      return new Response(JSON.stringify({ allowed: false, reason: 'pending' }), { headers: corsHeaders });
    }

    if (access.subscription_end) {
      const nowBD = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
      const endDate = new Date(access.subscription_end);
      if (nowBD > endDate) {
        return new Response(JSON.stringify({ allowed: false, reason: 'expired' }), { headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({
      allowed: true,
      role: 'user',
      sb2_unlocked: access.sb2_unlocked ?? false,
      sb3_unlocked: access.sb3_unlocked ?? false,
      sb4_unlocked: access.sb4_unlocked ?? false,
      sb5_unlocked: access.sb5_unlocked ?? false,
    }), { headers: corsHeaders });
  }

  // Remaining actions require admin role
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .single();

  if (!roleData) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

  if (action === 'get-users') {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const { data: profiles } = await supabaseAdmin.from('profiles').select('*');
    const { data: accesses } = await supabaseAdmin.from('user_access').select('*');
    const { data: roles } = await supabaseAdmin.from('user_roles').select('*');

    const combined = users?.users
      .filter(u => {
        const r = roles?.find(r => r.user_id === u.id)?.role;
        return r !== 'admin';
      })
      .map(u => {
        const profile = profiles?.find(p => p.id === u.id);
        const access = accesses?.find(a => a.user_id === u.id);
        return {
          id: u.id,
          email: u.email,
          name: profile?.name ?? '',
          phone_number: profile?.phone_number ?? '',
          status: access?.status ?? 'pending',
          subscription_end: access?.subscription_end ?? null,
          notes: access?.notes ?? '',
          created_at: u.created_at,
          sb2_unlocked: access?.sb2_unlocked ?? false,
          sb3_unlocked: access?.sb3_unlocked ?? false,
          sb4_unlocked: access?.sb4_unlocked ?? false,
          sb5_unlocked: access?.sb5_unlocked ?? false,
        };
      });

    return new Response(JSON.stringify({ users: combined ?? [] }), { headers: corsHeaders });
  }

  if (action === 'update-user-access') {
    const body = await req.json();
    const { user_id, status, subscription_end, notes, sb2_unlocked, sb3_unlocked, sb4_unlocked, sb5_unlocked } = body;
    const { error } = await supabaseAdmin
      .from('user_access')
      .upsert(
        {
          user_id,
          status,
          subscription_end: subscription_end || null,
          notes: notes || '',
          sb2_unlocked: sb2_unlocked ?? false,
          sb3_unlocked: sb3_unlocked ?? false,
          sb4_unlocked: sb4_unlocked ?? false,
          sb5_unlocked: sb5_unlocked ?? false,
        },
        { onConflict: 'user_id' }
      );
    if (error) {
      console.error('update-user-access error:', error);
      return new Response(JSON.stringify({ error: 'Failed to update user access' }), { status: 400, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  if (action === 'delete-user') {
    const body = await req.json();
    const { user_id } = body;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (error) {
      console.error('delete-user error:', error);
      return new Response(JSON.stringify({ error: 'Failed to delete user' }), { status: 400, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  if (action === 'update-setting') {
    const body = await req.json();
    const { key, value } = body;
    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) {
      console.error('update-setting error:', error);
      return new Response(JSON.stringify({ error: 'Failed to update setting' }), { status: 400, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  if (action === 'change-password') {
    const body = await req.json();
    const { new_password } = body;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password: new_password });
    if (error) {
      console.error('change-password error:', error);
      return new Response(JSON.stringify({ error: 'Failed to change password' }), { status: 400, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  if (action === 'get-stats') {
    const { data: accesses } = await supabaseAdmin.from('user_access').select('status, subscription_end');
    const { data: roles } = await supabaseAdmin.from('user_roles').select('role');
    const adminIds = new Set(roles?.filter(r => r.role === 'admin').map(r => r.user_id) ?? []);

    const nowBD = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));

    const { data: allRoles } = await supabaseAdmin.from('user_roles').select('user_id, role');
    const nonAdminUserIds = new Set(allRoles?.filter(r => r.role !== 'admin').map(r => r.user_id) ?? []);
    const nonAdminAccessList = (accesses ?? []).filter(a => nonAdminUserIds.has(a.user_id));

    const total = nonAdminAccessList.length;
    const active = nonAdminAccessList.filter(a => {
      if (a.status !== 'active') return false;
      if (a.subscription_end && new Date(a.subscription_end) < nowBD) return false;
      return true;
    }).length;
    const pending = nonAdminAccessList.filter(a => a.status === 'pending').length;

    return new Response(JSON.stringify({ total, active, pending }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
});
