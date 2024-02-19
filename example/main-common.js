// This file will be used by all application-level JS files of our one-page app,
// therefore it will be emitted in front of them all,
// therefore the files referenced below will be emitted in front of it,
// therefore we guarantee no code from any application-level JS file will interfere
// until these common prerequisites are executed and their declarations are in place.

// resource preprocessors must come the very first turn, before any resource has a chance
// to be queried via R$ - only this way we ensure they will register in time

//#use res-preprocessors.js

// link the code from l-common & l-runtime (its place against res-preprocessors.js is not guaranteed,
// but we know it makes no queries via R$, so it is ok)

//#use tools/l-common.js
//#use tools/l-runtime.js