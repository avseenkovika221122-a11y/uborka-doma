
import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight,
  ClipboardList, Copy, LogOut, Plus, Share2, Sparkles,
  Trash2, Users, X, Repeat, ArrowRightLeft
} from 'lucide-react';
import {
  API_ORIGIN, getSessionToken, clearSessionToken, api,
  createRecurringTask, type ApiGroup, type ApiMembership,
  type ApiTask, type ApiUser, type RatingRow
} from './api';
import './index.css';

type Tab = 'calendar' | 'add' | 'rating' | 'members';

type WeeklyRatingRow = RatingRow & {
  weeklyCompleted?: number;
  weeklyTasks?: {
    id: string;
    title: string;
    completedAt: string;
    scheduledAt: string;
  }[];
};

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WD = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const MEMBER_COLORS = [
  '#F4A261',
  '#6C8AE4',
  '#2A9D8F',
  '#C77DDB',
  '#E76F91',
  '#8A9A5B',
  '#D18B47',
];

const memberColor = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
};
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const sameDay = (a: Date,b: Date) => isoDay(a)===isoDay(b);
const niceDate = (v: string | Date) => new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(v instanceof Date ? v : new Date(v));

function AuthScreen({ onAuth }: { onAuth: (user: ApiUser) => void }) {
  const [mode,setMode] = useState<'login'|'register'>('login');
  const [name,setName] = useState('');
  const [pin,setPin] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const result = await api<{user:ApiUser}>(endpoint,{method:'POST',body:JSON.stringify({displayName:name,pin})});
      onAuth(result.user);
    } catch(err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen flex items-center justify-center p-4"><section className="w-full max-w-md rounded-[32px] bg-white p-7 sm:p-9 shadow-sm"><div className="mb-7 flex items-center gap-3"><div className="h-12 w-12 rounded-2xl bg-[#d4f25e] grid place-items-center text-2xl">🐶</div><div><p className="text-sm text-[#5e6472]">Домашний помощник</p><h1 className="text-2xl font-semibold">Уборка дома</h1></div></div><h2 className="text-xl font-semibold mb-2">{mode==='register'?'Создать профиль':'С возвращением'}</h2><p className="text-sm text-[#5e6472] mb-6">Войди по имени и PIN-коду или создай профиль для общего календаря.</p><form onSubmit={submit} className="space-y-3"><input className="field" placeholder="Твоё имя" value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={40}/><input className="field" type="password" inputMode="numeric" autoComplete={mode==='register'?'new-password':'current-password'} placeholder="PIN-код (6–12 цифр)" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,12))} required minLength={6} maxLength={12} pattern="[0-9]{6,12}"/><p className="text-xs text-[#777]">Запомни PIN-код: он понадобится для входа с других устройств.</p>{error&&<p className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="primary w-full">{busy?'Подожди…':mode==='login'?'Войти':'Создать профиль'}</button></form><div className="mt-5 text-sm"><button className="link" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');setPin('')}}>{mode==='login'?'Впервые здесь? Создать профиль':'Уже есть профиль? Войти'}</button></div><p className="mt-6 text-xs text-[#777]">После входа создай домашнюю группу и поделись кодом приглашения с остальными участниками.</p></section></main>;
}

export default function App(){
  const [user,setUser]=useState<ApiUser|null>(null);
  const [loading,setLoading]=useState(true);
  const [groups,setGroups]=useState<ApiMembership[]>([]);
  const [groupId,setGroupId]=useState('');
  const [tasks,setTasks]=useState<ApiTask[]>([]);
  const [completionOverrides,setCompletionOverrides]=useState<Record<string,boolean>>({});
  const [rating,setRating]=useState<WeeklyRatingRow[]>([]);
  const [tab,setTab]=useState<Tab>('calendar');
  const [quickTitle,setQuickTitle]=useState('');
  const [savingQuick,setSavingQuick]=useState(false);
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [selected,setSelected]=useState(()=>new Date());
  const [showTask,setShowTask]=useState(false);
  const [showRecurring,setShowRecurring]=useState(false);
  const [showGroup,setShowGroup]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const [viewMode,setViewMode]=useState<'month'|'week'>('month');
  const [notice,setNotice]=useState('');
  const [err,setErr]=useState('');

  const [editingTask,setEditingTask]=useState<string|null>(null);
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [date,setDate]=useState(isoDay(new Date()));
  const [time,setTime]=useState('12:00');
  const [assignee,setAssignee]=useState('');
  const [groupName,setGroupName]=useState('Наш дом');
  const [invite,setInvite]=useState('');
  const [inviteResult,setInviteResult]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');

  const [recurringTitle,setRecurringTitle]=useState('Пылесос');
  const [alternateTitle,setAlternateTitle]=useState('Мытьё полов');
  const [recurringStart,setRecurringStart]=useState('2026-11-14');
  const [assigneeOrder,setAssigneeOrder]=useState<string[]>([]);
  const [savingRecurring,setSavingRecurring]=useState(false);

  const group=groups.find(g=>g.group.id===groupId)?.group;
  const members=group?.members||[];
  const me=members.find(m=>m.userId===user?.id);
  const isOwner=me?.role==='OWNER';

  const loadGroups=useCallback(async()=>{
    const rows=await api<ApiMembership[]>('/groups');
    setGroups(rows);
    if(rows.length&&!groupId)setGroupId(rows[0].group.id);
    if(groupId&&!rows.some(r=>r.group.id===groupId))setGroupId(rows[0]?.group.id||'');
  },[groupId]);

  const loadData=useCallback(async()=>{
    if(!groupId)return;
    const [t,r]=await Promise.all([
      api<ApiTask[]>(`/groups/${groupId}/tasks`),
      api<WeeklyRatingRow[]>(`/groups/${groupId}/rating`)
    ]);
    setTasks(t);
    setRating(r);
  },[groupId]);

  useEffect(()=>{
    api<ApiUser>('/auth/me').then(setUser).catch(()=>setUser(null)).finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    if(user)loadGroups().catch(e=>setErr(e.message));
  },[user,loadGroups]);

  useEffect(()=>{
    if(groupId)loadData().catch(e=>setErr(e.message));
  },[groupId,loadData]);

  useEffect(()=>{
    if(!user||!groupId)return;
    const s=io(`${API_ORIGIN}/updates`,{auth:{token:getSessionToken()},transports:['websocket','polling']});
    s.on('connect',()=>s.emit('group:join',{groupId}));
    const refresh=()=>{void loadData();void loadGroups();};
    ['task:created','task:updated','task:deleted','group:members','group:updated'].forEach(ev=>s.on(ev,refresh));
    return()=>{s.disconnect()};
  },[user,groupId,loadData,loadGroups]);

  useEffect(()=>{
    if(!members.length)return;
    setAssigneeOrder(current=>{
      const valid=current.filter(id=>members.some(m=>m.userId===id));
      const missing=members.map(m=>m.userId).filter(id=>!valid.includes(id));
      return [...valid,...missing];
    });
  },[members]);

  const nextSaturday=(()=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+((6-d.getDay()+7)%7||7));return d;})();
  const saturdayTasks=tasks.filter(t=>sameDay(new Date(t.scheduledAt),nextSaturday));

  const selectedTasks=useMemo(
    ()=>tasks.filter(t=>sameDay(new Date(t.scheduledAt),selected)).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)),
    [tasks,selected]
  );

  const calendarDays=useMemo(()=>{
    if(viewMode==='week'){
      const monday=new Date(selected);
      monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
      return Array.from({length:7},(_,i)=>{
        const d=new Date(monday);
        d.setDate(monday.getDate()+i);
        return d;
      });
    }
    const offset=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;
    const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    return [...Array(offset).fill(null),...Array.from({length:days},(_,i)=>new Date(month.getFullYear(),month.getMonth(),i+1))];
  },[month,viewMode,selected]);

  const refresh=async()=>{
    await loadData();
    await loadGroups();
  };

  const addQuickTask=async(e:React.FormEvent)=>{
    e.preventDefault();
    const cleanTitle=quickTitle.trim();
    if(!groupId||!cleanTitle||savingQuick)return;
    setSavingQuick(true);
    try{
      await api(`/groups/${groupId}/tasks/quick-complete`,{
        method:'POST',
        body:JSON.stringify({title:cleanTitle})
      });
      setQuickTitle('');
      setNotice('Дело добавлено в выполненное');
      await loadData();
    }catch(e){
      setErr(e instanceof Error?e.message:'Не удалось добавить дело');
    }finally{
      setSavingQuick(false);
    }
  };

  const createTask=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!groupId)return;
    try{
      await api(`/groups/${groupId}/tasks${editingTask?`/${editingTask}`:''}`,{
        method:editingTask?'PUT':'POST',
        body:JSON.stringify({title,description,scheduledAt:new Date(`${date}T${time}`).toISOString(),assigneeId:assignee||null})
      });
      setShowTask(false);
      setEditingTask(null);
      setTitle('');
      setDescription('');
      setNotice(editingTask?'Задание обновлено':'Задание добавлено');
      await refresh();
    }catch(e){
      setErr(e instanceof Error?e.message:'Ошибка');
    }
  };

  const createRecurring=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!groupId||!assigneeOrder.length)return;
    setSavingRecurring(true);
    try{
      await createRecurringTask(groupId,{
        title:recurringTitle.trim(),
        alternateTitle:alternateTitle.trim(),
        startDate:new Date(`${recurringStart}T12:00:00`).toISOString(),
        assigneeIds:assigneeOrder
      });
      setShowRecurring(false);
      setNotice('Повторяющееся расписание создано');
      await loadData();
    }catch(e){
      setErr(e instanceof Error?e.message:'Не удалось создать расписание');
    }finally{
      setSavingRecurring(false);
    }
  };

  const moveAssignee=(index:number,direction:-1|1)=>{
    setAssigneeOrder(current=>{
      const next=[...current];
      const target=index+direction;
      if(target<0||target>=next.length)return current;
      [next[index],next[target]]=[next[target],next[index]];
      return next;
    });
  };

  const complete=async(t:ApiTask,done:boolean)=>{
    setCompletionOverrides(current=>({...current,[t.id]:done}));
    try{
      await api(`/groups/${groupId}/tasks/${t.id}/completion`,{method:'POST',body:JSON.stringify({completed:done})});
      void loadData().then(()=>{
        setCompletionOverrides(current=>{
          const next={...current};
          delete next[t.id];
          return next;
        });
      }).catch(e=>setErr(e instanceof Error?e.message:'Не удалось обновить данные'));
    }catch(e){
      setCompletionOverrides(current=>{
        const next={...current};
        delete next[t.id];
        return next;
      });
      setErr(e instanceof Error?e.message:'Ошибка');
    }
  };

  const removeTask=async(id:string)=>{
    if(!confirm('Удалить это задание?'))return;
    try{
      await api(`/groups/${groupId}/tasks/${id}`,{method:'DELETE'});
      await loadData();
    }catch(e){
      setErr(e instanceof Error?e.message:'Ошибка');
    }
  };

  const logout=async()=>{
    await api('/auth/logout',{method:'POST'});
    clearSessionToken();
    setUser(null);
    setGroups([]);
    setGroupId('');
  };

  const changePassword=async(e:React.FormEvent)=>{
    e.preventDefault();
    try{
      await api('/auth/password/change',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
      setShowPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setUser(null);
      setGroups([]);
      setGroupId('');
      setNotice('Пароль изменён. Войдите заново.');
    }catch(e){
      setErr(e instanceof Error?e.message:'Ошибка');
    }
  };

  const renameGroup=async()=>{
    if(!group)return;
    const next=prompt('Новое название группы',group.name);
    if(!next?.trim())return;
    try{
      await api(`/groups/${groupId}`,{method:'PUT',body:JSON.stringify({name:next.trim()})});
      await loadGroups();
    }catch(e){
      setErr(e instanceof Error?e.message:'Ошибка');
    }
  };

  const createGroup=async(e:React.FormEvent)=>{
    e.preventDefault();
    try{
      const g=await api<ApiGroup & {inviteCode:string}>('/groups',{method:'POST',body:JSON.stringify({name:groupName})});
      setInviteResult(g.inviteCode);
      await loadGroups();
      setGroupId(g.id);
      setShowGroup(true);
    }catch(e){
      setErr(e instanceof Error?e.message:'Ошибка');
    }
  };

  const joinGroup=async(e:React.FormEvent)=>{
    e.preventDefault();
    try{
      const joined=await api<{id:string}>(`/groups/join`,{method:'POST',body:JSON.stringify({code:invite})});
      setGroupId(joined.id);
      setInvite('');
      setShowGroup(false);
      await loadGroups();
    }catch(e){
      setErr(e instanceof Error?e.message:'Ошибка');
    }
  };

  const makeInvite=async()=>{
    try{
      const r=await api<{code:string}>(`/groups/${groupId}/invite`,{method:'POST'});
      setInviteResult(r.code);
      setShowGroup(true);
    }catch(e){
      setErr(e instanceof Error?e.message:'Ошибка');
    }
  };

  if(loading)return <div className="min-h-screen grid place-items-center text-[#5e6472]">Загружаем…</div>;
  if(!user)return <AuthScreen onAuth={u=>{setUser(u);setNotice('Добро пожаловать!')}}/>;

  return <main className="min-h-screen pb-10">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#d4f25e] text-2xl">🐶</div>
        <div><p className="text-xs text-[#5e6472]">Домашний помощник</p><h1 className="text-xl font-bold">Уборка дома</h1></div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:block text-sm text-[#5e6472]">{user.displayName}</span>
        <button className="secondary" onClick={()=>setShowPassword(true)}>PIN-код</button>
        <button className="icon-btn" title="Выйти" onClick={logout}><LogOut size={18}/></button>
      </div>
    </header>

    <div className="mx-auto max-w-6xl px-4">
      {err&&<div className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700 flex justify-between">{err}<button onClick={()=>setErr('')}><X size={16}/></button></div>}
      {notice&&<div className="mb-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}<button className="ml-3" onClick={()=>setNotice('')}>×</button></div>}

      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-4">
        <div className="flex items-center gap-2">
          <Users size={18}/>
          <select className="bg-transparent font-semibold outline-none" value={groupId} onChange={e=>setGroupId(e.target.value)}>
            {groups.map(r=><option key={r.group.id} value={r.group.id}>{r.group.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {group&&isOwner&&<button className="secondary" onClick={renameGroup}>Переименовать</button>}
          <button className="secondary" onClick={()=>setShowGroup(true)}>Группы</button>
        </div>
      </section>

      {!group&&<section className="rounded-3xl bg-white p-6">
        <h2 className="text-xl font-semibold mb-3">Создай домашнюю группу</h2>
        <form onSubmit={createGroup} className="flex flex-wrap gap-2">
          <input className="field flex-1 min-w-48" value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Название группы"/>
          <button className="primary">Создать группу</button>
        </form>
      </section>}

      {group&&<>
        <nav className="mb-5 flex gap-2 overflow-x-auto">
          {([{id:'calendar',label:'График',icon:CalendarDays},{id:'add',label:'Добавить',icon:Plus},{id:'rating',label:'Рейтинг',icon:BarChart3}] as const).map(x=><button key={x.id} onClick={()=>setTab(x.id)} className={`tab ${tab===x.id?'tab-active':''}`}><x.icon size={17}/>{x.label}</button>)}
        </nav>

        {tab==='calendar'&&<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.85fr]">
          <section className="rounded-3xl bg-white p-4 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-2">
              <div className="flex gap-1">
                <button className={`secondary !px-3 !py-1 ${viewMode==='month'?'!bg-[#232a3a] !text-white':''}`} onClick={()=>setViewMode('month')}>Месяц</button>
                <button className={`secondary !px-3 !py-1 ${viewMode==='week'?'!bg-[#232a3a] !text-white':''}`} onClick={()=>setViewMode('week')}>Неделя</button>
              </div>
              <button className="icon-btn" onClick={()=>viewMode==='month'?setMonth(new Date(month.getFullYear(),month.getMonth()-1,1)):setSelected(new Date(selected.getFullYear(),selected.getMonth(),selected.getDate()-7))}><ChevronLeft/></button>
              <h2 className="font-semibold">{viewMode==='month'?`${MONTHS[month.getMonth()]} ${month.getFullYear()}`:`Неделя · ${niceDate(calendarDays[0] as Date)}`}</h2>
              <button className="icon-btn" onClick={()=>viewMode==='month'?setMonth(new Date(month.getFullYear(),month.getMonth()+1,1)):setSelected(new Date(selected.getFullYear(),selected.getMonth(),selected.getDate()+7))}><ChevronRight/></button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {WD.map(d=><div key={d} className="text-center text-xs text-[#777] pb-2">{d}</div>)}
              {calendarDays.map((d,i)=>{
                if(!d)return <span key={i}/>;
                const dayTasks=tasks.filter(t=>sameDay(new Date(t.scheduledAt),d));
                const allDone=dayTasks.length>0&&dayTasks.every(t=>t.status==='COMPLETED');
                const dayAssigneeId=dayTasks.find(t=>t.assigneeId)?.assigneeId;
                const dayColor=dayAssigneeId?memberColor(dayAssigneeId):undefined;
                return <button key={i} onClick={()=>setSelected(d)} className={`aspect-square rounded-full text-sm relative ${dayColor?'text-white':sameDay(d,selected)?'bg-[#232a3a] text-white':sameDay(d,new Date())?'bg-[#d4f25e]':'hover:bg-[#f1f2ed]'} ${dayColor&&sameDay(d,selected)?'ring-2 ring-[#232a3a] ring-offset-2':''}`} style={dayColor?{backgroundColor:dayColor}:undefined}>
                  {d.getDate()}
                  {allDone&&<span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-[#232a3a] text-white"><Check size={10}/></span>}
                </button>;
              })}
            </div>
            <p className="mt-4 text-center text-xs text-[#777]">Выбери день, чтобы посмотреть задания</p>
            <div className="mt-5 rounded-2xl bg-[#f4f2ec] p-4">
              <p className="text-xs text-[#777]">Ближайшая суббота · {niceDate(nextSaturday)}</p>
              {saturdayTasks.length
                ? <div className="mt-2 space-y-2">{saturdayTasks.map(task=><div key={task.id} className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{task.title}</span><span className="shrink-0 text-xs text-[#777]">{task.assignee?.displayName||'Без исполнителя'}</span></div>)}</div>
                : <p className="mt-2 text-sm text-[#777]">Задания на эту субботу пока не появились</p>}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs text-[#777]">Расписание на день</p><h2 className="text-lg font-semibold">{niceDate(selected)}</h2></div>
              <div className="flex gap-2">
                <button className="secondary !px-3" onClick={()=>setShowRecurring(true)}><Repeat size={16}/> Повторение</button>
                <button className="primary !px-4" onClick={()=>{setEditingTask(null);setTitle('');setDescription('');setAssignee('');setDate(isoDay(selected));setShowTask(true)}}><Plus size={17}/> Добавить</button>
              </div>
            </div>
            {selectedTasks.length===0?<div className="py-12 text-center text-sm text-[#777]"><ClipboardList className="mx-auto mb-3" size={28}/>На этот день заданий пока нет</div>:<div className="space-y-3">
              {selectedTasks.map(t=>{
                const isDone=completionOverrides[t.id]??(t.status==='COMPLETED');
                const doneByMe=t.completions.some(c=>c.userId===user.id);
                return <article key={t.id} className="rounded-2xl bg-[#f4f2ec] border-l-4 p-4" style={{borderLeftColor:t.assigneeId?memberColor(t.assigneeId):'#b7bdc7'}}>
                <div className="flex items-start gap-3">
                  <button onClick={()=>complete(t,!(completionOverrides[t.id]??doneByMe))} className={`mt-0.5 h-6 w-6 rounded-full border-2 grid place-items-center shrink-0 ${isDone?'bg-[#232a3a] text-white border-[#232a3a]':'border-[#b7bdc7]'}`}>{isDone&&<Check size={14}/>}</button>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-semibold ${isDone?'line-through text-[#777]':''}`}>{t.title}</h3>
                    {t.description&&<p className="text-sm text-[#777] mt-1">{t.description}</p>}
                    <p className="mt-2 text-xs text-[#777]">{t.assignee?.displayName||'Без исполнителя'} · {new Date(t.scheduledAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</p>
                    {t.recurringTaskId&&<p className="mt-1 text-xs text-[#6d7d32] flex items-center gap-1"><Repeat size={12}/> Повторяющаяся задача</p>}
                  </div>
                  <div className="flex gap-1">
                    <button className="icon-btn !h-8 !w-8" title="Изменить или перенести" onClick={()=>{setEditingTask(t.id);setTitle(t.title);setDescription(t.description||'');setDate(isoDay(new Date(t.scheduledAt)));setTime(new Date(t.scheduledAt).toTimeString().slice(0,5));setAssignee(t.assigneeId||'');setShowTask(true)}}><ArrowRightLeft size={15}/></button>
                    <button className="icon-btn !h-8 !w-8" onClick={()=>removeTask(t.id)} title="Удалить"><Trash2 size={15}/></button>
                  </div>
                </div>
              </article>;
              })}
            </div>}
          </section>
        </div>}

        {tab==='add'&&<section className="mx-auto max-w-2xl rounded-3xl bg-white p-5 sm:p-7">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Что ты уже сделала?</h2>
            <p className="mt-1 text-sm text-[#777]">Добавить можно только собственное дело. Оно сразу отметится как выполненное и попадёт в недельную статистику.</p>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {['Помыла окна','Убрала кухню','Убрала ванную','Почистила туалет','Вынесла мусор','Помыла холодильник'].map(item=><button key={item} type="button" onClick={()=>setQuickTitle(item)} className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${quickTitle===item?'border-[#232a3a] bg-[#f4f2ec] font-semibold':'border-[#e7e5df] hover:bg-[#f8f7f3]'}`}>{item}</button>)}
          </div>
          <form onSubmit={addQuickTask} className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="quick-task-title">Название своего дела</label>
            <input id="quick-task-title" className="field" placeholder="Например, разобрала вещи в шкафу" value={quickTitle} onChange={e=>setQuickTitle(e.target.value)} required minLength={1} maxLength={120}/>
            <button className="primary w-full" disabled={savingQuick||!quickTitle.trim()}>{savingQuick?'Добавляем…':'Отметить как выполненное'}</button>
          </form>
        </section>}

        {tab==='rating'&&<section className="rounded-3xl bg-white p-5 sm:p-7">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Что сделали за неделю</h2>
            <p className="text-sm text-[#777]">С понедельника по воскресенье · каждое выполненное дело считается отдельно</p>
          </div>
          <div className="space-y-3">
            {rating.map(member=>{
              const weeklyTasks=member.weeklyTasks||[];
              return <article key={member.userId} className="rounded-2xl bg-[#f4f2ec] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full font-semibold text-white" style={{backgroundColor:memberColor(member.userId)}}>{member.name.slice(0,1).toUpperCase()}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-xs text-[#777]">Выполнено за неделю</p>
                  </div>
                  <strong className="text-2xl tabular-nums">{member.weeklyCompleted??weeklyTasks.length}</strong>
                  <span className="text-xs text-[#777]">дела</span>
                </div>
                {weeklyTasks.length
                  ? <ul className="space-y-2 border-t border-[#e5e1d8] pt-3">
                      {weeklyTasks.map(task=><li key={task.id} className="flex items-start justify-between gap-3 text-sm">
                        <span className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-[#6d7d32]"/>{task.title}</span>
                        <span className="shrink-0 text-xs text-[#888]">{new Date(task.completedAt).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</span>
                      </li>)}
                    </ul>
                  : <p className="border-t border-[#e5e1d8] pt-3 text-sm text-[#888]">На этой неделе пока нет выполненных дел</p>}
              </article>;
            })}
          </div>
        </section>}

        {tab==='members'&&<section className="rounded-3xl bg-white p-5 sm:p-7">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-semibold">Участники · {members.length}</h2>
            {isOwner&&<button className="secondary" onClick={makeInvite}><Share2 size={16}/> Код приглашения</button>}
          </div>
          <div className="space-y-3">
            {members.map(m=><div key={m.userId} className="flex items-center gap-3 rounded-2xl bg-[#f4f2ec] p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full font-semibold text-white" style={{backgroundColor:memberColor(m.userId)}}>{m.user.displayName.slice(0,1).toUpperCase()}</span>
              <div className="flex-1"><p className="font-semibold">{m.user.displayName}</p><p className="text-xs text-[#777]">{m.role==='OWNER'?'Владелец':'Участник'}</p></div>
              {isOwner&&m.role!=='OWNER'&&<button className="icon-btn" title="Удалить участника" onClick={async()=>{if(confirm('Удалить участника из группы?')){await api(`/groups/${groupId}/members/${m.userId}`,{method:'DELETE'});await loadGroups()}}}><Trash2 size={17}/></button>}
            </div>)}
          </div>
          <button className="secondary mt-5" onClick={async()=>{if(confirm('Покинуть эту группу?')){await api(`/groups/${groupId}/leave`,{method:'POST'});setGroupId('');await loadGroups()}}}>Покинуть группу</button>
        </section>}
      </>}
    </div>

    {showRecurring&&<div className="modal-backdrop" onClick={()=>setShowRecurring(false)}>
      <section className="modal" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between mb-5"><div><h2 className="text-xl font-semibold">Повторяющаяся уборка</h2><p className="text-sm text-[#777] mt-1">Каждую субботу по очереди</p></div><button onClick={()=>setShowRecurring(false)}><X/></button></div>
        <form onSubmit={createRecurring} className="space-y-4">
          <div><label className="text-sm font-medium">Обычная задача</label><input className="field mt-1" value={recurringTitle} onChange={e=>setRecurringTitle(e.target.value)} required maxLength={120}/></div>
          <div><label className="text-sm font-medium">Каждая четвёртая суббота</label><input className="field mt-1" value={alternateTitle} onChange={e=>setAlternateTitle(e.target.value)} required maxLength={120}/><p className="text-xs text-[#777] mt-1">Вместо обычной задачи будет назначаться эта уборка.</p></div>
          <div><label className="text-sm font-medium">Первая суббота расписания</label><input className="field mt-1" type="date" value={recurringStart} onChange={e=>setRecurringStart(e.target.value)} required/></div>
          <div>
            <label className="text-sm font-medium">Очередь участников</label>
            <p className="text-xs text-[#777] mt-1 mb-2">Исполнители будут меняться по порядку. Стрелками можно переставить участников.</p>
            <div className="space-y-2">
              {assigneeOrder.map((id,index)=>{
                const member=members.find(m=>m.userId===id);
                if(!member)return null;
                return <div key={id} className="flex items-center gap-3 rounded-xl bg-[#f4f2ec] p-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d4f25e] font-semibold">{index+1}</span>
                  <span className="flex-1 font-medium">{member.user.displayName}</span>
                  <button type="button" className="icon-btn !h-8 !w-8" disabled={index===0} onClick={()=>moveAssignee(index,-1)}><ChevronLeft size={16}/></button>
                  <button type="button" className="icon-btn !h-8 !w-8" disabled={index===assigneeOrder.length-1} onClick={()=>moveAssignee(index,1)}><ChevronRight size={16}/></button>
                </div>;
              })}
            </div>
          </div>
          <button className="primary w-full" disabled={savingRecurring||!assigneeOrder.length}>{savingRecurring?'Создаём расписание…':'Создать расписание'}</button>
        </form>
      </section>
    </div>}

    {showTask&&<div className="modal-backdrop" onClick={()=>setShowTask(false)}>
      <section className="modal" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between mb-5"><h2 className="text-xl font-semibold">{editingTask?'Изменить или перенести задание':'Новое задание'}</h2><button onClick={()=>setShowTask(false)}><X/></button></div>
        <form onSubmit={createTask} className="space-y-3">
          <input className="field" placeholder="Название уборки" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={120}/>
          <textarea className="field min-h-20" placeholder="Описание (необязательно)" value={description} onChange={e=>setDescription(e.target.value)}/>
          <div className="grid grid-cols-2 gap-2">
            <input className="field" type="date" value={date} onChange={e=>setDate(e.target.value)} required/>
            <input className="field" type="time" value={time} onChange={e=>setTime(e.target.value)} required/>
          </div>
          <select className="field" value={assignee} onChange={e=>setAssignee(e.target.value)}>
            <option value="">Без исполнителя</option>
            {members.map(m=><option key={m.userId} value={m.userId}>{m.user.displayName}</option>)}
          </select>
          {editingTask&&<p className="text-xs text-[#777]">Изменение даты переносит только эту задачу. Остальная очередь не меняется.</p>}
          <button className="primary w-full">{editingTask?'Сохранить изменения':'Сохранить задание'}</button>
        </form>
      </section>
    </div>}

    {showPassword&&<div className="modal-backdrop" onClick={()=>setShowPassword(false)}>
      <section className="modal" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between mb-5"><h2 className="text-xl font-semibold">Сменить PIN-код</h2><button onClick={()=>setShowPassword(false)}><X/></button></div>
        <form onSubmit={changePassword} className="space-y-3">
          <input className="field" type="password" placeholder="Текущий PIN-код" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required/>
          <input className="field" type="password" placeholder="Новый PIN-код (6–12 цифр)" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={6} maxLength={12} pattern="[0-9]{6,12}" inputMode="numeric" required/>
          <button className="primary w-full">Сохранить PIN-код</button>
        </form>
      </section>
    </div>}

    {showGroup&&<div className="modal-backdrop" onClick={()=>setShowGroup(false)}>
      <section className="modal" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between mb-5"><h2 className="text-xl font-semibold">Группы и приглашения</h2><button onClick={()=>setShowGroup(false)}><X/></button></div>
        <form onSubmit={joinGroup} className="space-y-2">
          <label className="text-sm font-medium">Присоединиться по коду</label>
          <input className="field" placeholder="Код приглашения" value={invite} onChange={e=>setInvite(e.target.value.toUpperCase())}/>
          <button className="secondary w-full">Присоединиться</button>
        </form>
        <div className="my-5 border-t"/>
        <form onSubmit={createGroup} className="space-y-2">
          <label className="text-sm font-medium">Создать новую группу</label>
          <input className="field" value={groupName} onChange={e=>setGroupName(e.target.value)}/>
          <button className="secondary w-full">Создать группу</button>
        </form>
        {inviteResult&&<div className="mt-5 rounded-2xl bg-[#f4f2ec] p-4">
          <p className="text-xs text-[#777] mb-2">Код приглашения</p>
          <div className="flex items-center justify-between gap-2">
            <strong className="text-xl tracking-widest">{inviteResult}</strong>
            <button className="secondary" onClick={()=>navigator.clipboard.writeText(inviteResult)}><Copy size={15}/> Копировать</button>
          </div>
        </div>}
      </section>
    </div>}

    <footer className="mx-auto mt-10 max-w-6xl px-4 text-center text-xs text-[#888]">Уборка дома · Общий порядок начинается с маленьких дел <Sparkles className="inline" size={12}/></footer>
  </main>;
}
