/** A newer read supersedes every older read, including post-mutation refreshes. */
export function createPurchaseLoadState(){let generation=0;return {begin(){return ++generation;},isCurrent(ticket){return ticket===generation;},invalidate(){generation++;}};}
