/**
 * ControlPanel — a configurable, tabbed control panel for demos.
 *
 * A demo opts in and fills it with only the controls it wants:
 *
 *   const panel = new ControlPanel({ title: 'Knit' });
 *   const geo = panel.tab('Geometry');
 *   geo.dropdown('Shape', { options: shapeOptions, value: 'Torus' }, onShape);
 *   geo.slider('Knits θ', { min: 8, max: 96, step: 1, value: 36 }, onKnits);
 *   panel.mount(document.body);
 *
 * Every control factory returns a small handle exposing `.value` and
 * `.set(v)` so the demo can read/update it programmatically. Tabs are
 * created lazily; the tab bar only appears once there are two or more.
 *
 * Vanilla DOM, no dependencies; styling is injected once.
 * Ported from knitted-surfaces src/scene/panel.ts (DESIGN.md §7).
 */

let stylesInjected = false
function injectStyles(): void {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .cp { position:fixed; top:12px; right:12px; width:248px; z-index:1000;
      background:rgba(26,26,28,0.92); color:#e0e0e0; border:1px solid #3a3a3d;
      border-radius:10px; font-family:system-ui,sans-serif; font-size:12px;
      backdrop-filter:blur(8px); box-shadow:0 6px 24px rgba(0,0,0,0.4); overflow:hidden; }
    .cp-header { display:flex; align-items:center; justify-content:space-between;
      padding:9px 12px; cursor:pointer; user-select:none; border-bottom:1px solid #303033; }
    .cp-title { font-weight:600; letter-spacing:0.02em; }
    .cp-collapse { color:#888; font-size:11px; }
    .cp.collapsed .cp-body { display:none; }
    .cp.collapsed .cp-header { border-bottom:none; }
    .cp-tabs { display:flex; gap:2px; padding:6px 6px 0; }
    .cp-tab { flex:1; padding:6px 4px; text-align:center; cursor:pointer; color:#999;
      border-radius:6px 6px 0 0; transition:background 0.1s,color 0.1s; white-space:nowrap; }
    .cp-tab:hover { color:#ddd; }
    .cp-tab.active { color:#fff; background:#2c2c30; }
    .cp-pages { padding:10px 12px 12px; }
    .cp-page { display:none; flex-direction:column; gap:9px; }
    .cp-page.active { display:flex; }
    .cp-row { display:flex; align-items:center; gap:8px; }
    .cp-row > label { flex:0 0 86px; color:#bbb; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cp-row input[type=range] { flex:1; min-width:0; accent-color:#6aa0ff; }
    .cp-row .cp-val { flex:0 0 36px; text-align:right; color:#fff; font-variant-numeric:tabular-nums; }
    .cp-row select { flex:1; min-width:0; background:#2c2c30; color:#e0e0e0; border:1px solid #44444a;
      border-radius:5px; padding:4px 6px; font-size:12px; }
    .cp-row input[type=color] { flex:0 0 40px; height:22px; padding:0; border:1px solid #44444a;
      border-radius:5px; background:#2c2c30; cursor:pointer; }
    .cp-btn { width:100%; padding:7px 10px; background:#34343a; color:#e0e0e0; border:1px solid #46464c;
      border-radius:6px; cursor:pointer; font-size:12px; font-family:inherit; transition:background 0.1s; }
    .cp-btn:hover { background:#3e3e45; }
    .cp-toggle { display:flex; align-items:center; justify-content:space-between; cursor:pointer; }
    .cp-toggle .cp-switch { width:34px; height:18px; border-radius:9px; background:#46464c; position:relative; transition:background 0.15s; }
    .cp-toggle .cp-switch::after { content:''; position:absolute; top:2px; left:2px; width:14px; height:14px;
      border-radius:50%; background:#ddd; transition:transform 0.15s; }
    .cp-toggle.on .cp-switch { background:#6aa0ff; }
    .cp-toggle.on .cp-switch::after { transform:translateX(16px); }
  `
  document.head.appendChild(style)
}

export interface SliderSpec {
  min: number
  max: number
  step: number
  value: number
}
export interface SliderHandle {
  value: number
  set(v: number): void
  readonly row: HTMLElement
}

export interface DropdownOption {
  label: string
  value: string
}
export interface DropdownSpec {
  options: DropdownOption[]
  value: string
}
export interface DropdownHandle {
  value: string
  set(v: string): void
  /** Replace the option list (and select `value` if given) — for data-driven dropdowns. */
  setOptions(options: DropdownOption[], value?: string): void
}

export interface ToggleHandle {
  value: boolean
  set(v: boolean): void
  setLabel(label: string): void
}
export interface ButtonHandle {
  setLabel(label: string): void
  readonly el: HTMLButtonElement
}
export interface ColorHandle {
  value: string
  set(hex: string): void
}
export interface LabelHandle {
  set(text: string): void
}

/** A single tab page; controls are appended here. */
export class Tab {
  readonly page: HTMLDivElement

  constructor(page: HTMLDivElement) {
    this.page = page
  }

  slider(label: string, spec: SliderSpec, onChange: (v: number) => void): SliderHandle {
    const row = document.createElement('div')
    row.className = 'cp-row'
    const lab = document.createElement('label')
    lab.textContent = label
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(spec.min)
    input.max = String(spec.max)
    input.step = String(spec.step)
    input.value = String(spec.value)
    const val = document.createElement('span')
    val.className = 'cp-val'
    const fmt = (v: number) => (Number.isInteger(spec.step) ? String(v) : v.toFixed(2))
    val.textContent = fmt(spec.value)
    input.addEventListener('input', () => {
      const v = Number(input.value)
      val.textContent = fmt(v)
      onChange(v)
    })
    row.append(lab, input, val)
    this.page.appendChild(row)
    return {
      get value() {
        return Number(input.value)
      },
      set(v: number) {
        input.value = String(v)
        val.textContent = fmt(v)
      },
      row,
    }
  }

  dropdown(label: string, spec: DropdownSpec, onChange: (v: string) => void): DropdownHandle {
    const row = document.createElement('div')
    row.className = 'cp-row'
    const lab = document.createElement('label')
    lab.textContent = label
    const select = document.createElement('select')
    const fill = (options: DropdownOption[]) => {
      select.innerHTML = ''
      for (const opt of options) {
        const o = document.createElement('option')
        o.value = opt.value
        o.textContent = opt.label
        select.appendChild(o)
      }
    }
    fill(spec.options)
    select.value = spec.value
    select.addEventListener('change', () => onChange(select.value))
    row.append(lab, select)
    this.page.appendChild(row)
    return {
      get value() {
        return select.value
      },
      set(v: string) {
        select.value = v
      },
      setOptions(options: DropdownOption[], value?: string) {
        fill(options)
        if (value !== undefined) select.value = value
      },
    }
  }

  color(label: string, value: string, onChange: (hex: string) => void): ColorHandle {
    const row = document.createElement('div')
    row.className = 'cp-row'
    const lab = document.createElement('label')
    lab.textContent = label
    const input = document.createElement('input')
    input.type = 'color'
    input.value = value
    input.addEventListener('input', () => onChange(input.value))
    row.append(lab, input)
    this.page.appendChild(row)
    return {
      get value() {
        return input.value
      },
      set(v: string) {
        input.value = v
      },
    }
  }

  toggle(label: string, value: boolean, onChange: (v: boolean) => void): ToggleHandle {
    const row = document.createElement('div')
    row.className = 'cp-toggle' + (value ? ' on' : '')
    const lab = document.createElement('span')
    lab.textContent = label
    const sw = document.createElement('span')
    sw.className = 'cp-switch'
    row.append(lab, sw)
    let state = value
    row.addEventListener('click', () => {
      state = !state
      row.classList.toggle('on', state)
      onChange(state)
    })
    this.page.appendChild(row)
    return {
      get value() {
        return state
      },
      set(v: boolean) {
        state = v
        row.classList.toggle('on', v)
      },
      setLabel(l: string) {
        lab.textContent = l
      },
    }
  }

  /** A read-only text row (e.g. a live samples counter). */
  label(label: string, initial = ''): LabelHandle {
    const row = document.createElement('div')
    row.className = 'cp-row'
    const lab = document.createElement('label')
    lab.textContent = label
    const val = document.createElement('span')
    val.className = 'cp-val'
    val.style.flex = '1'
    val.textContent = initial
    row.append(lab, val)
    this.page.appendChild(row)
    return {
      set(text: string) {
        val.textContent = text
      },
    }
  }

  button(label: string, onClick: () => void): ButtonHandle {
    const btn = document.createElement('button')
    btn.className = 'cp-btn'
    btn.textContent = label
    btn.addEventListener('click', onClick)
    this.page.appendChild(btn)
    return {
      setLabel(l: string) {
        btn.textContent = l
      },
      el: btn,
    }
  }
}

export interface ControlPanelOptions {
  title?: string
  collapsed?: boolean
}

export class ControlPanel {
  readonly domElement: HTMLDivElement
  private tabsBar: HTMLDivElement
  private pages: HTMLDivElement
  private tabs = new Map<string, { tab: Tab; button: HTMLDivElement; page: HTMLDivElement }>()
  private activeName: string | null = null

  constructor(options: ControlPanelOptions = {}) {
    injectStyles()
    this.domElement = document.createElement('div')
    this.domElement.className = 'cp' + (options.collapsed ? ' collapsed' : '')

    const header = document.createElement('div')
    header.className = 'cp-header'
    const title = document.createElement('span')
    title.className = 'cp-title'
    title.textContent = options.title ?? 'Controls'
    const collapse = document.createElement('span')
    collapse.className = 'cp-collapse'
    collapse.textContent = '▾'
    header.append(title, collapse)
    header.addEventListener('click', () => {
      const collapsed = this.domElement.classList.toggle('collapsed')
      collapse.textContent = collapsed ? '▸' : '▾'
    })

    const body = document.createElement('div')
    body.className = 'cp-body'
    this.tabsBar = document.createElement('div')
    this.tabsBar.className = 'cp-tabs'
    this.tabsBar.style.display = 'none'
    this.pages = document.createElement('div')
    this.pages.className = 'cp-pages'
    body.append(this.tabsBar, this.pages)

    this.domElement.append(header, body)
  }

  /** Get or lazily create a named tab. */
  tab(name: string): Tab {
    const existing = this.tabs.get(name)
    if (existing) return existing.tab

    const page = document.createElement('div')
    page.className = 'cp-page'
    this.pages.appendChild(page)

    const button = document.createElement('div')
    button.className = 'cp-tab'
    button.textContent = name
    button.addEventListener('click', () => this.select(name))
    this.tabsBar.appendChild(button)

    const tab = new Tab(page)
    this.tabs.set(name, { tab, button, page })

    // Show the tab bar only once a second tab exists.
    this.tabsBar.style.display = this.tabs.size >= 2 ? 'flex' : 'none'
    if (this.activeName === null) this.select(name)
    return tab
  }

  private select(name: string): void {
    this.activeName = name
    for (const [n, { button, page }] of this.tabs) {
      const active = n === name
      button.classList.toggle('active', active)
      page.classList.toggle('active', active)
    }
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.domElement)
  }
}
