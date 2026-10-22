on run argv
	set playlistId to item 1 of argv
	tell application "Music"
		set matches to (every user playlist whose persistent ID is playlistId)
		if (count of matches) > 0 then delete item 1 of matches
	end tell
	return ""
end run
