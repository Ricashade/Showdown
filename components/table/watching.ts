"use client";

import { createContext, useContext } from "react";

/**
 * True inside a read-only copy of a table: the mini view of another table, or watching it up
 * close. Such copies make no sound, so only your own table is heard.
 */
export const WatchingContext = createContext(false);
export const useWatching = () => useContext(WatchingContext);
