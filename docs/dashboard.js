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
from bokeh.plotting import figure, output_notebook, show
from bokeh.models import DatetimeTickFormatter, FixedTicker
from datetime import datetime

import colorcet as cc

hv.extension('bokeh')
pn.extension('echarts','mathjax',comms="vscode")


# %%
def construct_df(data):
    df = pd.DataFrame()
    for col in [
        "slc",
        "ampcor input",
        "ampcor ouput",
        "offmap",
        "interferogram",
        "deramp",
        "geo",
        "figure",
    ]:
        factor = 2 if col == "slc" else 1
        df[col] = data[col] / (factor * data["pairs"]) * 100
    return df


# %%
def create_progress_column(df,columns,icesheet):
    return pn.Column(
        *[
            pn.Row(
                pn.panel(col, width=90, margin=(-10, 0, 0, 0)),
                pn.indicators.Progress(
                    width=240,
                    value=int(df[col].iloc[-1]),
                    margin=(-5, 0, -15, 0),
                    bar_color='success',
                ),
                pn.panel(
                    f"{icesheet[col].iloc[-1]} / {icesheet['pairs'].iloc[-1]}",
                    margin=(-10, 0, 0, 10),
                ),
            )
            for col in columns
        ]
    )



# %%
def create_bar_plot(data):
    df = data.copy()
    df["date1"] = pd.to_datetime(df["date1"], format="%y-%m-%d")
    df["date2"] = pd.to_datetime(df["date2"], format="%y-%m-%d")
    melted_df = df.melt(
        id_vars=["pairs"], value_vars=["date1", "date2"], value_name="date"
    ).drop(columns="variable")

    unique_dates = melted_df["date"].drop_duplicates().reset_index(drop=True).to_frame()
    unique_dates["count"] = 1
    unique_dates["month"] = unique_dates["date"].dt.month
    month_to_color = {
        month: cc.glasbey_cool[::-1][(month - 1) * len(cc.glasbey_cool[::-1]) // 13]
        for month in range(1, 13)
    }
    unique_dates["color"] = unique_dates["month"].map(month_to_color)

    bar = figure(
        x_axis_type="datetime",
        height=190,
        width=900,
        x_range=(datetime(2022, 12, 1), datetime(2023, 12, 31)),
    )
    bar_width_days = 0.5
    bar_width_ms = bar_width_days * 24 * 60 * 60 * 1000
    bar.vbar(
        x=unique_dates["date"],
        top=unique_dates["count"],
        width=bar_width_ms,
        color=unique_dates["color"],
    )
    monthly_ticks = [datetime(2023, month, 1) for month in range(1, 13)]
    bar.xaxis.ticker = FixedTicker(
        ticks=[tick.timestamp() * 1000 for tick in monthly_ticks]
    )
    bar.xaxis.formatter = DatetimeTickFormatter(months=["%B "])
    bar.yaxis.major_tick_line_color = None
    bar.yaxis.minor_tick_line_color = None
    bar.yaxis.major_label_text_font_size = "0pt"
    bar.ygrid.visible = False

    return bar



# %%
# Gauges for CPU WORKLOAD
def create_gauge_with_label(label, value, bounds=(0, 100), title_size=11, height=190):
    text_pane = pn.pane.Markdown(f'### **{label}**', align='center', margin=(-29,0,0,60))
    gauge = pn.indicators.Gauge(name='CPU USAGE', value=round(value), 
                                bounds=bounds, title_size=title_size, height=height, margin=(0,-65,0,0))
    return pn.Column(gauge, text_pane)



# %%

try:
    antarctica = pd.read_json('https://raw.githubusercontent.com/jbbarre/s1_dashboard/master/docs/s1_antarctica_2023_12d_check.json')
except ValueError as e:
    print(f"Error reading JSON: {e}")
try:
    greenland = pd.read_json('https://raw.githubusercontent.com/jbbarre/s1_dashboard/master/docs/s1_greenland_2023_12d_check.json')
except ValueError as e:
    print(f"Error reading JSON: {e}")
try:
    ant_dates_df = pd.read_json('https://raw.githubusercontent.com/jbbarre/s1_dashboard/master/docs/s1_antarctica_2023_12d_dates.json')
except ValueError as e:
    print(f"Error reading JSON: {e}")
try:
    gre_dates_df = pd.read_json('https://raw.githubusercontent.com/jbbarre/s1_dashboard/master/docs/s1_greenland_2023_12d_dates.json')
except ValueError as e:
    print(f"Error reading JSON: {e}") 

#antarctica = pd.read_json('./docs/s1_antarctica_2023_12d_check.json')
#greenland = pd.read_json('./docs/s1_greenland_2023_12d_check.json')
#ant_dates_df = pd.read_json('./docs/s1_antarctica_2023_12d_dates.json')
#gre_dates_df = pd.read_json('./docs/s1_greenland_2023_12d_dates.json')

df_ant = construct_df(antarctica)
df_gre = construct_df(greenland)

# %%
#create progress bar
ant_progress_col1 = create_progress_column(df_ant,df_ant.columns[0:4],antarctica)
ant_progress_col2 = create_progress_column(df_ant,df_ant.columns[4:],antarctica)
#create Bar plot for time serie
ant_bar = create_bar_plot(ant_dates_df)

# %%
oates = create_gauge_with_label('OATES', round(antarctica['cpu_oates'].iloc[-1]))
bakutis = create_gauge_with_label('BAKUTIS', round(antarctica['cpu_bakutis'].iloc[-1]))
pennell = create_gauge_with_label('PENNELL', round(antarctica['cpu_pennell'].iloc[-1]))
mawson = create_gauge_with_label('MAWSON', round(antarctica['cpu_mawson'].iloc[-1]))

ant_gauges= pn.Row(oates,bakutis,pennell,mawson)

# %%
ant_intro = pn.Row(
    pn.Column(
        pn.pane.Markdown(f""" 
            ## ANTARCTICA: \`{antarctica['pairs'].values[0]}\` PAIRS IN PROCESS
            """
        ),
        pn.Row(
            pn.Spacer(width=80),
            
            pn.pane.Markdown(f""" 
                ### Data Location: \`/u/oates-r0/eric/SENTINEL1\`
                """, margin=(-10,0,0,0))
        ),
        pn.Row(
            pn.Spacer(width=80),
            
            pn.pane.Markdown(f""" 
                ### Time Range in process: \`{ant_dates_df.date1.min()} to {ant_dates_df.date1.max()}\`
                """, margin=(-5,0,0,0))
        ),
        

    ))

ant_first_raw = ant_intro
ant_second_raw = pn.Row(pn.Column(pn.pane.Markdown(f'## Progress', margin=(0,0,0,25)),pn.Row(pn.Spacer(width=80), ant_progress_col1,pn.Spacer(width=80),ant_progress_col2)))
ant_third_raw = pn.Row(pn.Column(pn.pane.Markdown(f'## Images Processed', margin=(0,0,0,25)),pn.Row(pn.Spacer(width=70), ant_bar)))
ant_forth_raw= pn.Row(pn.Column(pn.pane.Markdown(f'## CPU Workload', margin=(0,0,0,25)),ant_gauges))

ant_layout=pn.Column(ant_first_raw,pn.Spacer(height=15),ant_second_raw, pn.Spacer(height=15),ant_third_raw,pn.Spacer(height=15),ant_forth_raw)

# %%
gre_progress_col1 = create_progress_column(df_gre,df_gre.columns[0:4],greenland)
gre_progress_col2 = create_progress_column(df_gre,df_gre.columns[4:],greenland)
gre_bar = create_bar_plot(gre_dates_df)


# %%

hobbs = create_gauge_with_label('HOBBS', round(greenland['cpu_hobbs'].iloc[-1]))
bakutis = create_gauge_with_label('BAKUTIS', round(greenland['cpu_bakutis'].iloc[-1]))
pennell = create_gauge_with_label('PENNELL', round(greenland['cpu_pennell'].iloc[-1]))
mawson = create_gauge_with_label('MAWSON', round(greenland['cpu_mawson'].iloc[-1]))

gre_gauges= pn.Row(hobbs)

# %%
gre_intro = pn.Row(
    pn.Column(
        pn.pane.Markdown(f""" 
            ## GREENLAND: \`{greenland['pairs'].values[0]}\` PAIRS IN PROCESS
            """
        ),
        pn.Row(
            pn.Spacer(width=80),
            
            pn.pane.Markdown(f""" 
                ### Data Location: \`/u/hobbs-r1/eric/SENTINEL1_greenland\`
                """, margin=(-10,0,0,0))
        ),
        pn.Row(
            pn.Spacer(width=80),
            
            pn.pane.Markdown(f""" 
                ### Time Range in process: \`{gre_dates_df.date1.min()} to {gre_dates_df.date1.max()}\`
                """, margin=(-5,0,0,0))
        ),
        

    ))
gre_first_raw = gre_intro
gre_second_raw = pn.Row(pn.Column(pn.pane.Markdown(f'## Progress', margin=(0,0,0,25)),pn.Row(pn.Spacer(width=80), gre_progress_col1,pn.Spacer(width=80),gre_progress_col2)))
gre_third_raw = pn.Row(pn.Column(pn.pane.Markdown(f'## Images Processed', margin=(0,0,0,25)),pn.Row(pn.Spacer(width=70), gre_bar)))
gre_forth_raw= pn.Row(pn.Column(pn.pane.Markdown(f'## CPU Workload', margin=(0,0,0,25)),gre_gauges))

gre_layout=pn.Column(gre_first_raw,pn.Spacer(height=15),gre_second_raw, pn.Spacer(height=15),gre_third_raw,pn.Spacer(height=15),gre_forth_raw)

# %%
tabs = pn.Tabs(('ANTARCTICA',ant_layout), ('GREENLAND',gre_layout))
tabs.servable(title='MEaSUREs')
#tabs.show(title='MEaSUREs')

# %%

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
