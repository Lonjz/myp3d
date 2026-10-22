on run argv
	set fieldSep to character id 31
	set playlistId to item 1 of argv
	set newName to item 2 of argv
	set newDescription to item 3 of argv
	set artPath to item 4 of argv
	set trackIds to {}
	if (count of argv) > 4 then set trackIds to items 5 thru -1 of argv
	set artData to missing value
	if artPath is not "" then set artData to read (POSIX file artPath) as JPEG picture

	tell application "Music"
		if playlistId is "" then
			set targetPlaylist to make new user playlist with properties {name:newName}
		else
			set matches to (every user playlist whose persistent ID is playlistId)
			if (count of matches) is 0 then error "That playlist is no longer in Apple Music" number 1
			set targetPlaylist to item 1 of matches
			if name of targetPlaylist is not newName then set name of targetPlaylist to newName
			try
				delete every track of targetPlaylist
			end try
		end if

		set currentDescription to ""
		try
			set currentDescription to description of targetPlaylist
		end try
		if currentDescription is missing value then set currentDescription to ""
		if currentDescription is not newDescription then set description of targetPlaylist to newDescription

		repeat with trackId in trackIds
			try
				duplicate (some track of library playlist 1 whose persistent ID is (trackId as text)) to targetPlaylist
			end try
		end repeat

		set artState to "noart"
		if artData is not missing value then
			try
				set data of artwork 1 of targetPlaylist to artData
				set artState to "art"
			on error errMsg
				set artState to "noart:" & errMsg
			end try
		end if
		return (persistent ID of targetPlaylist) & fieldSep & artState
	end tell
end run
