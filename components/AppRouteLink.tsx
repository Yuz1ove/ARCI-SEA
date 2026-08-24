'use client';

import { useRouter } from 'next/navigation';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';

type Props=Omit<AnchorHTMLAttributes<HTMLAnchorElement>,'href'> & {href:string};

export function AppRouteLink({href,onClick,...props}:Props){
  const router=useRouter();
  const navigate=(event:MouseEvent<HTMLAnchorElement>)=>{
    onClick?.(event);
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target&&event.currentTarget.target!=='_self') return;
    event.preventDefault();
    router.push(href);
  };
  return <a {...props} href={href} onClick={navigate}/>;
}
