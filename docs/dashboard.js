importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/pyc/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/1.2.3/dist/wheels/bokeh-3.2.2-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.2.3/dist/wheels/panel-1.2.3-py3-none-any.whl', 'pyodide-http==0.2.1', 'colorcet', 'holoviews', 'hvplot', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

# ---
# jupyter:
#   jupytext:
#     formats: ipynb,py:percent
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.15.2
#   kernelspec:
#     display_name: Python 3 (ipykernel)
#     language: python
#     name: python3
# ---

# %%
import pandas as pd
import panel as pn
import holoviews as hv
import hvplot.pandas
from bokeh.models import DatetimeTickFormatter

import colorcet as cc

hv.extension('bokeh')
pn.extension('echarts','mathjax',comms="vscode")

# %%
antarctica = pd.read_json('antarctica_2023_12d.json')
antarctica.tail()

# %%
df_ant = pd.DataFrame()
df_ant ['slc']=antarctica['slc']/(2*antarctica['pairs'])*100 # *2: we have two slc per pair
df_ant ['ampcor input']=antarctica['ampcor input']/antarctica['pairs']*100
df_ant ['ampcor ouput']=antarctica['ampcor ouput']/antarctica['pairs']*100
df_ant ['offmap']=antarctica['offmap']/antarctica['pairs']*100
df_ant ['interferogram']=antarctica['interferogram']/antarctica['pairs']*100
df_ant ['deramp']=antarctica['deramp']/antarctica['pairs']*100
df_ant ['geo']=antarctica['geo']/antarctica['pairs']*100
df_ant ['figure']=antarctica['figure']/antarctica['pairs']*100

# %%
greenland = pd.read_json('greenland_2023_12d.json')
greenland.tail()

# %%
df_gre = pd.DataFrame()
df_gre ['slc']=greenland['slc']/(2*greenland['pairs'])*100 # *2: we hav two slc per pair
df_gre ['ampcor input']=greenland['ampcor input']/greenland['pairs']*100
df_gre ['ampcor ouput']=greenland['ampcor ouput']/greenland['pairs']*100
df_gre ['offmap']=greenland['offmap']/greenland['pairs']*100
df_gre ['interferogram']=greenland['interferogram']/greenland['pairs']*100
df_gre ['deramp']=greenland['deramp']/greenland['pairs']*100
df_gre ['geo']=greenland['geo']/greenland['pairs']*100
df_gre ['figure']=greenland['figure']/greenland['pairs']*100

# %%
ant_box1 = pn.Column(
    *[
        pn.Row(
            pn.panel(col, width=70, margin=(-10, 0, 0, 0)),
            pn.indicators.Progress(
                width=300,
                value=int(df_ant[col].iloc[-1]),
                margin=(0, 0, -10, 0),
                bar_color='secondary',
            ),
            pn.panel(
                f'{antarctica[col].iloc[-1]} / {antarctica["pairs"].iloc[-1]}',
                margin=(-10, 0, 0, 10),
            ),
        )
        for col in df_ant.columns
    ]
)

ant_gauge = pn.indicators.Gauge(name='CPU USAGE', value=round(antarctica['cpu'].iloc[-1])
                    , bounds=(0, 100),title_size=14, height=260)

# %%
ant_intro = pn.pane.Markdown("""
 ## ANTARCTICA
 
- Data processed on **OATES**.
- Starting date : **08/17/2023**.
- Number of pairs to process: **4969**
- location of data(path): xxxxx
- which track is processed
- what about time range

 """)

ant_layout=pn.Column(ant_intro,pn.Row(pn.Spacer(width=80),ant_box1,pn.Spacer(width=80),ant_gauge))

# %%
##https://towardsdatascience.com/how-to-deploy-a-panel-visualization-dashboard-to-github-pages-2f520fd8660

# %%
gre_box1 = pn.Column(
    *[
        pn.Row(
            pn.panel(col, width=70, margin=(-10, 0, 0, 0)),
            pn.indicators.Progress(
                width=300,
                value=int(df_gre[col].iloc[-1]),
                margin=(0, 0, -10, 0),
                bar_color='secondary',
            ),
            pn.panel(
                f"{greenland[col].iloc[-1]} / {greenland['pairs'].iloc[-1]}",
                margin=(-10, 0, 0, 10),
            ),
        )
        for col in df_gre.columns
    ]
)

gre_gauge = pn.indicators.Gauge(name='CPU USAGE', value=round(greenland['cpu'].iloc[-1])
                    , bounds=(0, 100),title_size=14, height=260)

gre_intro = pn.pane.Markdown("""
 ## GREENLAND
 
- Data processed on **HOBBS**jupyter_bokeh.
- Starting date : **08/17/2023**.
- Number of pairs to process: **3636**
 """)

gre_layout = pn.Column(gre_intro,pn.Row(pn.Spacer(width=80),gre_box1,pn.Spacer(width=80),gre_gauge))


# %%
pn.Row(ant_layout,gre_layout).servable()

# %%


await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    state.curdoc.apply_json_patch(patch.to_py(), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()