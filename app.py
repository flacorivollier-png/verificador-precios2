import streamlit as st
import pandas as pd

st.title("Verificador de precios")

archivo = st.file_uploader("Subir archivo CSV o Excel", type=["csv", "xlsx"])

if archivo is not None:
    if archivo.name.endswith(".csv"):
        df = pd.read_csv(archivo, sep=None, engine="python")
    else:
        df = pd.read_excel(archivo)

    st.success("Archivo cargado correctamente")

    codigo = st.text_input("Escanear o escribir código de barras")

    if codigo:
        resultado = df[df["Código"].astype(str) == codigo]

        if not resultado.empty:
            nombre = resultado.iloc[0]["Nombre"]
            presentacion = resultado.iloc[0]["Presentación"]
            precio = resultado.iloc[0]["Precio"]

            st.success(nombre)
            st.write("Presentación:", presentacion)
            st.markdown(f"# ${precio}")
        else:
            st.error("Producto no encontrado")