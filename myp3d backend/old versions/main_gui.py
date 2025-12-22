import os
import sys
import eyed3
from yt_dlp import YoutubeDL
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageTk
import io

OUTPUT_DIR = "downloads"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def download_as_mp3(url, metadata=None, cover_path=None, custom_name=None):
    ffmpeg_path = os.path.join(os.path.dirname(sys.argv[0]), "ffmpeg.exe")
    # Default outtmpl with video title
    outtmpl = f"{OUTPUT_DIR}/%(title)s.%(ext)s"
    if custom_name:  # Use custom filename if provided
        outtmpl = os.path.join(OUTPUT_DIR, f"{custom_name}.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "ffmpeg_location": ffmpeg_path,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ],  
        "quiet": False,
        "noplaylist": True,
    }
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        mp3_file = os.path.splitext(filename)[0] + ".mp3"
        if custom_name:
            mp3_file = os.path.join(OUTPUT_DIR, f"{custom_name}.mp3")

    # Add metadata and cover
    if metadata:
        audio = eyed3.load(mp3_file)
        if audio.tag is None:
            audio.initTag()
        audio.tag.title = metadata.get("title")
        audio.tag.artist = metadata.get("artist")
        audio.tag.album = metadata.get("album")
        if cover_path and os.path.exists(cover_path):
            with open(cover_path, "rb") as img:
                audio.tag.images.set(3, img.read(), "image/jpeg")
        audio.tag.save(version=(2, 3, 0))
    return mp3_file


root = tk.Tk()
root.title("YouTube MP3 Downloader & Metadata Editor")
root.geometry("900x550")

notebook = ttk.Notebook(root)
notebook.pack(fill="both", expand=True)

# ---- Tab 1: Download ----
tab_download = ttk.Frame(notebook)

notebook.add(tab_download, text="Download MP3")

tk.Label(tab_download, text="YouTube URL:").pack(anchor="w")
url_entry = tk.Entry(tab_download, width=60)
url_entry.pack(anchor="w")

tk.Label(tab_download, text="Custom Filename (optional):").pack(anchor="w")
custom_name_entry = tk.Entry(tab_download, width=60)
custom_name_entry.pack(anchor="w")

meta_fields = {}
for field in ["Title", "Artist", "Album"]:
    tk.Label(tab_download, text=field + ":").pack(anchor="w")
    e = tk.Entry(tab_download, width=60)
    e.pack(anchor="w")
    meta_fields[field.lower()] = e

cover_path_var = tk.StringVar()
def select_cover():
    path = filedialog.askopenfilename(filetypes=[("Image files", "*.jpg *.jpeg *.png")])
    if path:
        cover_path_var.set(path)

tk.Button(tab_download, text="Choose Cover Image", command=select_cover).pack(anchor="w")
tk.Label(tab_download, textvariable=cover_path_var).pack(anchor="w")

def start_download():
    url = url_entry.get().strip()
    if not url:
        messagebox.showerror("Error", "Please enter a URL")
        return
    metadata = {k: v.get().strip() for k, v in meta_fields.items() if v.get().strip()}
    custom_name = custom_name_entry.get().strip() or None
    try:
        mp3_file = download_as_mp3(url, metadata, cover_path_var.get(), custom_name)
        messagebox.showinfo("Success", f"Downloaded: {os.path.basename(mp3_file)}")
        load_mp3_list()

        url_entry.delete(0, tk.END)
        custom_name_entry.delete(0, tk.END)
        for e in meta_fields.values():
            e.delete(0, tk.END)
        cover_path_var.set("")
    except Exception as e:
        messagebox.showerror("Error", str(e))


tk.Button(tab_download, text="Download", command=start_download).pack(anchor="center", pady=10)

tab_meta = ttk.Frame(notebook)
notebook.add(tab_meta, text="Edit Metadata")

sidebar = tk.Listbox(tab_meta, width=40)
sidebar.pack(side="left", fill="y")
scrollbar = tk.Scrollbar(tab_meta, orient="vertical", command=sidebar.yview)
scrollbar.pack(side="left", fill="y")
sidebar.config(yscrollcommand=scrollbar.set)

edit_frame = ttk.Frame(tab_meta)
edit_frame.pack(side="left", fill="both", expand=True, padx=10)

edit_entries = {}
for field in ["Filename", "Title", "Artist", "Album"]:
    tk.Label(edit_frame, text=field + ":").pack(anchor="w")
    e = tk.Entry(edit_frame, width=50)
    e.pack(anchor="w")
    edit_entries[field.lower()] = e

cover_edit_var = tk.StringVar()
def select_new_cover():
    path = filedialog.askopenfilename(filetypes=[("Image files", "*.jpg *.jpeg *.png")])
    if path:
        cover_edit_var.set(path)

current_file = None

def load_mp3_list():
    sidebar.delete(0, tk.END)
    for f in os.listdir(OUTPUT_DIR):
        if f.lower().endswith(".mp3"):
            sidebar.insert(tk.END, f)

def on_select(event):
    global current_file
    if not sidebar.curselection():
        return
    current_file = os.path.join(OUTPUT_DIR, sidebar.get(sidebar.curselection()))
    audio = eyed3.load(current_file)
    if audio and audio.tag:
        # Load text fields
        edit_entries["filename"].delete(0, tk.END)
        edit_entries["filename"].insert(0, os.path.basename(current_file))
        edit_entries["title"].delete(0, tk.END)
        edit_entries["artist"].delete(0, tk.END)
        edit_entries["album"].delete(0, tk.END)
        edit_entries["title"].insert(0, audio.tag.title or "")
        edit_entries["artist"].insert(0, audio.tag.artist or "")
        edit_entries["album"].insert(0, audio.tag.album or "")
        cover_preview_label.config(image='', text="")  
        if audio.tag.images:
            img_data = audio.tag.images[0].image_data
            img = Image.open(io.BytesIO(img_data))
            img.thumbnail((200, 200))
            img_tk = ImageTk.PhotoImage(img)
            cover_preview_label.image = img_tk
            cover_preview_label.config(image=img_tk)

sidebar.bind("<<ListboxSelect>>", on_select)

def save_metadata():
    global current_file
    if not current_file:
        messagebox.showerror("Error", "No MP3 selected")
        return
    audio = eyed3.load(current_file)
    if audio.tag is None:
        audio.initTag()
    audio.tag.title = edit_entries["title"].get()
    audio.tag.artist = edit_entries["artist"].get()
    audio.tag.album = edit_entries["album"].get()
    if cover_edit_var.get() and os.path.exists(cover_edit_var.get()):
        with open(cover_edit_var.get(), "rb") as img:
            audio.tag.images.set(3, img.read(), "image/jpeg")
    audio.tag.save(version=(2, 3, 0))
    # Rename file if needed
    new_name = edit_entries["filename"].get().strip()
    if new_name and new_name != os.path.basename(current_file):
        new_path = os.path.join(OUTPUT_DIR, new_name)
        if not new_path.lower().endswith(".mp3"):
            new_path += ".mp3"
        os.rename(current_file, new_path)
        current_file = new_path
    messagebox.showinfo("Success", f"Metadata updated for {os.path.basename(current_file)}")
    load_mp3_list()

# Create a small horizontal frame for Choose Cover + Save Changes
cover_frame = tk.Frame(edit_frame)
cover_frame.pack(anchor="w", pady=5)

# Place Choose Cover and Save Changes side by side
tk.Button(cover_frame, text="Choose New Cover", command=select_new_cover).pack(side="left", padx=5)
tk.Button(cover_frame, text="Save Changes", command=save_metadata).pack(side="left", padx=5)

# Show the selected cover path below the buttons
tk.Label(edit_frame, textvariable=cover_edit_var).pack(anchor="w")

# Preview stays below
cover_preview_label = tk.Label(edit_frame)
cover_preview_label.pack(anchor="w", pady=5)

player_frame = tk.Frame(edit_frame)
player_frame.pack(anchor="w", pady=5)

def play_mp3():
    global current_file
    if current_file and os.path.exists(current_file):
        try:
            os.startfile(current_file) 
        except Exception as e:
            messagebox.showerror("Error", f"Cannot play MP3: {e}")
    else:
        messagebox.showerror("Error", "No MP3 selected to play")

tk.Button(player_frame, text="Play in Default Player", command=play_mp3).pack(side="left", padx=5)
    
load_mp3_list()
root.mainloop()
