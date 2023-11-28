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
from bokeh.plotting import figure, output_notebook, show
from bokeh.models import DatetimeTickFormatter, FixedTicker
from datetime import datetime
import param

import colorcet as cc

hv.extension("bokeh")
pn.extension("echarts", "mathjax", comms="vscode")


# %%
def construct_df(data):
    df = pd.DataFrame()
    for col in ["offmap", "interferogram", "geo", "figure", "cleaned", "cubes"]:
        factor = 2 if col == "slc" else 1
        df[col] = data[col] / (factor * (data["pairs"] - data["sdv"])) * 100
    return df


# %%
def create_progress_column(df, columns, icesheet):
    return pn.Column(
        *[
            pn.Row(
                pn.panel(col, width=90, margin=(-10, 0, 0, 0)),
                pn.indicators.Progress(
                    width=200,
                    value=int(df[col].iloc[-1]),
                    margin=(-5, 0, -15, 0),
                    bar_color="success",
                ),
                pn.panel(
                    f"{icesheet[col].iloc[-1]} / {round(icesheet['pairs'].iloc[-1] - icesheet['sdv'].iloc[-1])} ",
                    margin=(-10, 0, 0, 10),
                ),
            )
            if col != "cubes"
            else pn.Row(
                pn.panel(col, width=90, margin=(-10, 0, 0, 0)),
                # Set the text size using CSS style. You can adjust '20px' to your preferred size.
                pn.pane.Markdown(
                    f"<div style='font-size: 15px;'>{round(icesheet[col].iloc[-1])} netcdf files created.</div>",
                    margin=(1, 0, 0, 0),
                ),
            )
            for col in columns
        ]
    )


# %%
def create_vel_bar_plot(data):
    df = data.copy()
    df["date1"] = pd.to_datetime(df["date1"], format="%Y-%m-%d")
    df["date2"] = pd.to_datetime(df["date2"], format="%Y-%m-%d")
    df = df[df["velocities"] == 1]
    ts_year = df["date1"].dt.year.max()

    melted_df = df.melt(
        id_vars=["pairs"], value_vars=["date1", "date2"], value_name="date"
    ).drop(columns="variable")

    unique_dates = melted_df["date"].drop_duplicates().reset_index(drop=True).to_frame()
    unique_dates["count"] = 1
    unique_dates["month"] = unique_dates["date"].dt.month

    bar = figure(
        x_axis_type="datetime",
        height=190,
        width=900,
        x_range=(datetime(ts_year - 1, 12, 1), datetime(ts_year, 12, 31)),
    )
    bar_width_days = 0.5
    bar_width_ms = bar_width_days * 24 * 60 * 60 * 1000
    bar.vbar(
        x=unique_dates["date"],
        top=unique_dates["count"],
        width=bar_width_ms,
    )
    monthly_ticks = [datetime(ts_year, month, 1) for month in range(1, 13)]
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
    text_pane = pn.pane.Markdown(
        f"### **{label}**", align="center", margin=(-29, 0, 0, 60)
    )
    gauge = pn.indicators.Gauge(
        name="CPU USAGE",
        value=round(value),
        bounds=bounds,
        title_size=title_size,
        height=height,
        margin=(0, -65, 0, 0),
    )
    return pn.Column(gauge, text_pane)


# %%
def process(df, df_dates, df_is, select, region):
    # create progress bar
    progress_col1 = create_progress_column(df, df.columns[0:3], df_is)
    progress_col2 = create_progress_column(df, df.columns[3:], df_is)
    # create Bar plot for time serie
    bar = create_vel_bar_plot(df_dates)

    oates = create_gauge_with_label("OATES", round(df_is["cpu_oates"].iloc[-1]))
    bakutis = create_gauge_with_label("BAKUTIS", round(df_is["cpu_bakutis"].iloc[-1]))
    pennell = create_gauge_with_label(
        "PENNELL", 0
    )  # round(antarctica['cpu_pennell'].iloc[-1]))
    mawson = create_gauge_with_label("MAWSON", round(df_is["cpu_mawson"].iloc[-1]))

    if region == "antarctica":
        data_path = "`/u/oates-r0/eric/SENTINEL1`"
    else:
        data_path = "`/u/hobbs-r1/eric/SENTINEL1_greenland`"

    gauges = pn.Row(oates, bakutis, pennell, mawson)

    intro = pn.Row(
        pn.Column(
            pn.Row(select),
            pn.Row(
                pn.Spacer(width=60),
                pn.pane.Markdown(
                    f""" 
                ### Dataset: `{round(df_is['pairs'].iloc[-1] - df_is['sdv'].iloc[-1])}` pairs in process.
                """,
                    margin=(-10, 0, 0, 0),
                ),
            ),
            pn.Row(
                pn.Spacer(width=60),
                pn.pane.Markdown(
                    f""" 
                ### Data Location: {data_path}
                """,
                    margin=(-10, 0, 0, 0),
                ),
            ),
            pn.Row(
                pn.Spacer(width=60),
                pn.pane.Markdown(
                    f""" 
                ### Time Range in process: `{df_dates.date1.min()}` to `{df_dates.date1.max()}`
                """,
                    margin=(-5, 0, 0, 0),
                ),
            ),
        )
    )

    first_raw = intro
    # progress
    second_raw = pn.Row(
        pn.Column(
            pn.pane.Markdown(f"## Progress", margin=(0, 0, 0, 25)),
            pn.Row(
                pn.Spacer(width=60), progress_col1, pn.Spacer(width=60), progress_col2
            ),
        )
    )
    # avilable velocities
    third_raw = pn.Row(
        pn.Column(
            pn.pane.Markdown(f"## Available Velocities", margin=(0, 0, 0, 25)),
            pn.Row(pn.Spacer(width=70), bar),
        )
    )
    # servers workload
    forth_raw = pn.Row(
        pn.Column(
            pn.pane.Markdown(f"## Servers Workload", margin=(0, 0, 0, 25)), gauges
        )
    )
    # concatenation
    layout = pn.Column(
        first_raw,
        pn.Spacer(height=15),
        second_raw,
        pn.Spacer(height=15),
        third_raw,
        pn.Spacer(height=15),
        forth_raw,
    )

    return layout


# %%
# Define a parameterized class
class YearSelector(param.Parameterized):
    year = param.Integer(default=2022)  # Default year
    region = param.String(default="antarctica")  # Default region

    def get_file_name(self):
        file_name_check = "./docs/s1_{}_{}_12d_check.json".format(
            self.region, self.year
        )
        # file_name_check = 'https://raw.githubusercontent.com/jbbarre/s1_dashboard/master/docs/s1_{}_{}_12d_check.json'.format(self.region, self.year)
        file_name_dates = "./docs/s1_{}_{}_12d_dates.json".format(
            self.region, self.year
        )
        # file_name_dates = 'https://raw.githubusercontent.com/jbbarre/s1_dashboard/master/docs/s1_{}_{}_12d_dates.json'.format(self.region, self.year)
        return file_name_check, file_name_dates


# Create an instance of the class
year_selector = YearSelector()


def create_year_select(region_name):
    return pn.widgets.Select(
        name=f"Select Year for {region_name}",
        options=[str(year) for year in range(2022, 2025)],
        value=str(year_selector.year),
        width=200,
    )


# Create select boxes for Antarctica and Greenland
ant_select = create_year_select("Antarctica")
gre_select = create_year_select("Greenland")


def update_year(event, region):
    # Update the year and region
    year_selector.year = int(event.new)
    year_selector.region = region
    # Fetch and process the data
    file_name_check, file_name_dates = year_selector.get_file_name()
    data = pd.read_json(file_name_check)
    dates_df = pd.read_json(file_name_dates)
    dates_df["date1"] = pd.to_datetime(dates_df["date1"], format="%y-%m-%d")
    dates_df["date2"] = pd.to_datetime(dates_df["date2"], format="%y-%m-%d")
    # Remove the time component
    dates_df["date1"] = dates_df["date1"].dt.date
    dates_df["date2"] = dates_df["date2"].dt.date
    df = construct_df(data)
    layout = process(
        df, dates_df, data, ant_select if region == "antarctica" else gre_select, region
    )
    # Update the tabs
    if region == "antarctica":
        tabs[0] = ("ANTARCTICA", layout)
    else:
        tabs[1] = ("GREENLAND", layout)


# Create callbacks for each region
def ant_update_year(event):
    update_year(event, "antarctica")


def gre_update_year(event):
    update_year(event, "greenland")


# Link the select widget to the callback
ant_select.param.watch(ant_update_year, "value")
gre_select.param.watch(gre_update_year, "value")


# Function to initialize data and layout for a given region
def initialize_data_and_layout(region):
    year_selector.region = region
    data = pd.read_json(year_selector.get_file_name()[0])
    dates_df = pd.read_json(year_selector.get_file_name()[1])
    dates_df["date1"] = pd.to_datetime(dates_df["date1"], format="%y-%m-%d")
    dates_df["date2"] = pd.to_datetime(dates_df["date2"], format="%y-%m-%d")
    # Remove the time component
    dates_df["date1"] = dates_df["date1"].dt.date
    dates_df["date2"] = dates_df["date2"].dt.date
    df = construct_df(data)
    print(list(df.columns))
    return process(
        df, dates_df, data, ant_select if region == "antarctica" else gre_select, region
    )


# Initialize data and create plots and pages
ant_layout = initialize_data_and_layout("antarctica")
gre_layout = initialize_data_and_layout("greenland")

# Create and display tabs
tabs = pn.Tabs(("ANTARCTICA", ant_layout), ("GREENLAND", gre_layout))
tabs.servable(title="MEaSUREs")
# tabs.show(title='MEaSUREs')

# %%
