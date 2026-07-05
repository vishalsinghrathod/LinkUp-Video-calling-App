"use client"

import React from 'react'
import {motion} from "motion/react"
import {Sparkle} from "lucide-react"

const Navbar = ({show}:{show:Boolean}) => {
  if(!show){
    return null
  }
  return (
    <motion.div 
    initial={{y:-40}} 
    animate={{y:0}}
    transition={{duration:0.4}}
    className='fixed top-0 left-0 right-0 z-30 bg-black/50 backdrop-blur border-b border-white/10'>
                <div className='max-w-7xl mx-auto px-6 py-4 flex items-center gap-3'>
                    <motion.span 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                      className='flex items-center justify-center w-9 h-9 rounded-xl bg-linear-to-b from-purple-500/20 to-indigo-500/10 border border-purple-500/30 text-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.15)]'
                    >
                        <Sparkle size={18} />
                    </motion.span>
                    <span className='text-lg font-semibold tracking-tight text-white'>
                        LinkUp
                    </span>
                </div>
    </motion.div>
  )
}

export default Navbar;