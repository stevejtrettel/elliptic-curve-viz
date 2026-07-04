// Demo loader: every demos/<name>/main.ts is discovered statically; ?demo=<name>
// selects one, no query shows the index. `vite build` bundles all demos (gallery-ready).

const modules = import.meta.glob('./*/main.ts')

const name = new URLSearchParams(location.search).get('demo')
const key = `./${name}/main.ts`

if (name && key in modules) {
  void modules[key]!()
} else {
  const names = Object.keys(modules)
    .map((k) => k.slice(2, -'/main.ts'.length))
    .sort()
  document.body.innerHTML = `
    <div style="font: 16px/1.6 system-ui; max-width: 40rem; margin: 4rem auto; padding: 0 1rem">
      <h1 style="font-weight: 600">elliptic-curve-viz demos</h1>
      ${name ? `<p style="color: #b00">No demo named “${name}”.</p>` : ''}
      <ul>
        ${names.map((n) => `<li><a href="?demo=${n}">${n}</a></li>`).join('\n')}
      </ul>
    </div>`
}
