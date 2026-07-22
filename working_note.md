# Working Note

---

## compress issues

2026 06 14

Right now it is pretty sure that issue occurre when creating gif or compressing (esspecially usin LZW right now?)

One of the solution is move to [gif.js.optimized](https://github.com/terikon/gif.js.optimized)

but problem might appeal when runing .html locally without hosing a localhost

will need to balance these pros / cons 

check codex histroy for detail

### Resolution — 2026-07-22

The pre-compression frames were correct. The custom LZW encoder increased its
code width immediately after adding the threshold dictionary entry, one emitted
code earlier than the decoder. Code-width growth now happens after emitting the
data code that lets the decoder catch up. A regression test covers 9- through
12-bit codes and a full dictionary reset.
