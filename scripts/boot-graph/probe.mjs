const t0 = performance.now();
await import(process.argv[2]);
console.log(JSON.stringify({ ms: performance.now() - t0 }));
process.exit(0);
