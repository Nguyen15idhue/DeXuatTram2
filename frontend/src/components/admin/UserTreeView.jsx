import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Building2, User, ShieldAlert } from 'lucide-react';

const ROLE_RANK = { SUPER_ADMIN: 0, ADMIN: 1, SALES: 2, CTV: 3, NPP: 3 };
const SPECIAL_LABEL = 'Phòng ban đặc biệt';
const UNASSIGNED_LABEL = 'Chưa phân phòng ban';
const ROOT_LABEL = 'Công ty TMT EGREEN Việt Nam';

const deptOf = (u) => (u.department && String(u.department).trim()) || '';

const matchUser = (u, q) => {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  return [u.full_name, u.email, u.phone, u.external_id].some(v => (v || '').toLowerCase().includes(s));
};

export default function UserTreeView({ users, search, onSelect }) {
  const [expanded, setExpanded] = useState(null);

  const tree = useMemo(() => {
    const q = (search || '').trim();
    const byId = {};
    (users || []).forEach(u => { byId[u.id] = u; });
    let list = users || [];
    if (q) {
      const keep = new Set();
      list.forEach(u => {
        if (matchUser(u, search)) {
          keep.add(u.id);
          let p = u.parent_id;
          while (p && byId[p] && !keep.has(p)) { keep.add(p); p = byId[p].parent_id; }
        }
      });
      list = list.filter(u => keep.has(u.id));
    }
    const inList = new Set(list.map(u => u.id));
    const specials = list.filter(u => u.role === 'SUPER_ADMIN').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    const rest = list.filter(u => u.role !== 'SUPER_ADMIN');
    const byDept = {};
    rest.forEach(u => {
      const d = deptOf(u) || UNASSIGNED_LABEL;
      (byDept[d] = byDept[d] || []).push(u);
    });
    const deptNames = Object.keys(byDept).sort((a, b) => {
      if (a === UNASSIGNED_LABEL) return 1;
      if (b === UNASSIGNED_LABEL) return -1;
      return a.localeCompare(b);
    });
    const sortFn = (a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) || (a.full_name || '').localeCompare(b.full_name || '');
    const buildNodes = (members) => {
      const children = {};
      const roots = [];
      members.forEach(u => {
        if (u.parent_id && inList.has(u.parent_id) && members.some(m => m.id === u.parent_id)) {
          (children[u.parent_id] = children[u.parent_id] || []).push(u);
        } else {
          roots.push(u);
        }
      });
      roots.sort(sortFn);
      Object.values(children).forEach(arr => arr.sort(sortFn));
      const walk = (nodes) => nodes.map(n => ({ user: n, children: children[n.id] ? walk(children[n.id]) : [] }));
      return walk(roots);
    };
    return {
      specials,
      depts: deptNames.map(name => ({ name, nodes: buildNodes(byDept[name]) }))
    };
  }, [users, search]);

  useEffect(() => {
    if (!search || !search.trim()) return;
    const next = new Set(['root', 'special']);
    const mark = (nodes) => nodes.forEach(n => {
      next.add(`u:${n.user.id}`);
      mark(n.children);
    });
    tree.depts.forEach(d => {
      next.add(`dept:${d.name}`);
      mark(d.nodes);
    });
    tree.specials.forEach(u => next.add(`u:${u.id}`));
    setExpanded(next);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOpen = (key) => {
    if (expanded === null) return true;
    return expanded.has(key);
  };
  const toggle = (key) => {
    setExpanded(prev => {
      const base = prev === null ? new Set(['root']) : new Set(prev);
      if (base.has(key)) base.delete(key);
      else base.add(key);
      return base;
    });
  };

  const renderPerson = (node, depth) => {
    const u = node.user;
    const key = `u:${u.id}`;
    const open = isOpen(key);
    return (
      <div key={u.id}>
        <div className="flex items-center gap-1 py-1" style={{ paddingLeft: 8 + depth * 20 }}>
          {node.children.length > 0 ? (
            <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={() => toggle(key)}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-6 flex justify-center text-base-content/30"><User size={12} /></span>
          )}
          <button type="button" className="link link-primary text-sm font-medium" onClick={() => onSelect(u.id)}>
            {u.full_name || u.email}
          </button>
          <span className="badge badge-ghost badge-xs">{u.role}</span>
          {u.chuc_vu ? <span className="text-xs text-base-content/60">{u.chuc_vu}</span> : null}
        </div>
        {open && node.children.map(c => renderPerson(c, depth + 1))}
      </div>
    );
  };

  const renderGroup = (key, icon, label, count, children) => {
    const open = isOpen(key);
    return (
      <div key={key} className="border border-base-300 rounded-lg mb-2">
        <button type="button" className="w-full flex items-center gap-2 px-3 py-2 font-semibold text-sm" onClick={() => toggle(key)}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {icon}
          <span>{label}</span>
          <span className="badge badge-ghost badge-xs ml-auto">{count}</span>
        </button>
        {open && <div className="px-2 pb-2">{children}</div>}
      </div>
    );
  };

  const countNodes = (nodes) => nodes.reduce((a, n) => a + 1 + countNodes(n.children), 0);

  const totalPeople = tree.specials.length + tree.depts.reduce((a, d) => a + d.nodes.length, 0);

  return (
    <div>
      <button type="button" className="w-full flex items-center gap-2 px-1 py-2 font-bold" onClick={() => toggle('root')}>
        {isOpen('root') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Building2 size={16} className="text-primary" />
        <span>{ROOT_LABEL}</span>
      </button>
      {isOpen('root') && (
        <div className="space-y-2">
          {tree.specials.length > 0 && renderGroup(
            'special',
            <ShieldAlert size={14} className="text-warning" />,
            SPECIAL_LABEL,
            tree.specials.length,
            tree.specials.map(u => renderPerson({ user: u, children: [] }, 0))
          )}
          {tree.depts.map(d => renderGroup(
            `dept:${d.name}`,
            <Building2 size={14} className="text-primary" />,
            d.name,
            countNodes(d.nodes),
            d.nodes.map(n => renderPerson(n, 0))
          ))}
          {totalPeople === 0 && (
            <div className="text-center py-8 text-base-content/50 text-sm">Không có người dùng</div>
          )}
        </div>
      )}
    </div>
  );
}
