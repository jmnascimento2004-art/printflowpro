'use client';
import { useEffect, useState } from 'react';
export function useAgendaSourceFocus(){
  const [id,setId]=useState('');
  useEffect(()=>{setId(new URLSearchParams(window.location.search).get('agendaId')||'');},[]);
  const clear=()=>{setId('');const url=new URL(window.location.href);url.searchParams.delete('agendaId');window.history.replaceState(null,'',url);};
  return {id,banner:id?<div className="mb-3 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><span>Registro selecionado pela Agenda</span><button onClick={clear} className="text-primary">Mostrar todos</button></div>:null};
}
