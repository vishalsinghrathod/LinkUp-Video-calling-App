"use client"

import React, { useEffect, useRef } from 'react'

function VideoRoom({ roomId }: { roomId: string }) {
  const zpRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let zpInstance: any = null;

    const start = async () => {
      const { ZegoUIKitPrebuilt } = await import("@zegocloud/zego-uikit-prebuilt");
      
      if (!active) return;

      const userId = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);
      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
        Number(process.env.NEXT_PUBLIC_ZEGO_APP_ID),
        process.env.NEXT_PUBLIC_ZEGO_SERVER_SECRET!,
        roomId,
        userId,
        "stranger"
      );

      const zp = ZegoUIKitPrebuilt.create(kitToken);
      zpInstance = zp;
      zpRef.current = zp;

      zp.joinRoom({
        container: containerRef.current,
        scenario: {mode: ZegoUIKitPrebuilt.OneONoneCall},
        showPreJoinView: false,
        showTextChat: true,
        maxUsers: 2
      })
    }
    start();

    return () =>{
      active = false;
      if(zpInstance){
        try {
          zpInstance.leaveRoom()
          zpInstance.destroy()
        } catch (error) {
          zpRef.current=null
        }
      }
    }
  },[roomId])

  return (
    <div ref={containerRef} className='w-full h-[80vh]' />


  )
}

export default VideoRoom;