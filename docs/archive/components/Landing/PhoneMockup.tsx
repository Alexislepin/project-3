'use client';

import { BookOpen, Users, Scan, Home, Search, User, Bell } from 'lucide-react';

export default function PhoneMockup() {
  return (
    <div className="flex justify-center items-center py-20 px-4">
      <div className="relative w-full max-w-sm phone-perspective">
        <div className="relative mx-auto animate-float phone-tilt">
          {/* Phone Frame */}
          <div className="relative bg-lexu-darkGray rounded-[3rem] p-2 shadow-2xl">
            {/* Screen */}
            <div className="bg-lexu-black rounded-[2.5rem] overflow-hidden">
              {/* Status Bar */}
              <div className="flex justify-between items-center px-6 pt-4 pb-2 text-xs text-lexu-white/60">
                <span>9:41</span>
                <div className="flex gap-1">
                  <div className="w-4 h-2 border border-lexu-white/60 rounded-sm">
                    <div className="w-3/4 h-full bg-lexu-white/60 rounded-sm" />
                  </div>
                </div>
              </div>

              {/* Header */}
              <div className="px-6 py-4 border-b border-lexu-gray">
                <h2 className="text-xl font-display font-bold text-lexu-white">
                  Feed
                </h2>
              </div>

              {/* Content */}
              <div className="px-6 py-4 space-y-4 min-h-[500px]">
                {/* Book Card */}
                <div className="bg-lexu-gray rounded-xl p-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="w-16 h-24 bg-lexu-darkGray rounded-lg flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-display font-semibold text-lexu-white mb-1">
                        Le Comte de Monte-Cristo
                      </h3>
                      <p className="text-sm text-lexu-white/60 mb-2">
                        Alexandre Dumas
                      </p>
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-lexu-yellow/20 text-lexu-yellow rounded-full text-xs font-medium">
                        <BookOpen className="w-3 h-3" />
                        Page 245/312
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity Card */}
                <div className="bg-lexu-gray rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-lexu-yellow rounded-full flex items-center justify-center">
                      <Users className="w-5 h-5 text-lexu-black" />
                    </div>
                    <div>
                      <p className="text-sm text-lexu-white">
                        <span className="font-semibold">Sophie</span> a rejoint le club{' '}
                        <span className="text-lexu-yellow">Sci-Fi Fans</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Nav */}
              <div className="border-t border-lexu-gray bg-lexu-darkGray px-6 py-4">
                <div className="flex items-center justify-around">
                  <Home className="w-6 h-6 text-lexu-white/60" />
                  <Search className="w-6 h-6 text-lexu-white/60" />
                  <button className="w-14 h-14 bg-lexu-yellow rounded-full flex items-center justify-center shadow-lg">
                    <Scan className="w-6 h-6 text-lexu-black" />
                  </button>
                  <Bell className="w-6 h-6 text-lexu-white/60" />
                  <User className="w-6 h-6 text-lexu-white/60" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

