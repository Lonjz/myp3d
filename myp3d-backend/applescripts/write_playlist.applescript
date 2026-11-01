on run argv
	set fieldSep to character id 31
	set playlistId to item 1 of argv
	set newName to item 2 of argv
	set newDescription to item 3 of argv
	set artPath to item 4 of argv
	set changes to {}
	if (count of argv) > 4 then set changes to items 5 thru -1 of argv
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
		end if

		set currentDescription to ""
		try
			set currentDescription to description of targetPlaylist
		end try
		if currentDescription is missing value then set currentDescription to ""
		if currentDescription is not newDescription then set description of targetPlaylist to newDescription

		set removals to {}
		set additions to {}
		set AppleScript's text item delimiters to ":"
		repeat with change in changes
			set changeText to change as text
			if changeText starts with "-" then
				set end of removals to {(text item 1 of (text 2 thru -1 of changeText)) as integer, text item 2 of changeText}
			else
				set end of additions to text 2 thru -1 of changeText
			end if
		end repeat
		set AppleScript's text item delimiters to ""

		set trackCount to count of tracks of targetPlaylist
		repeat with removal in removals
			set trackIndex to item 1 of removal
			if trackIndex > trackCount then error "The playlist changed in Apple Music, check again" number 1
			if persistent ID of track trackIndex of targetPlaylist is not (item 2 of removal) then error "The playlist changed in Apple Music, check again" number 1
		end repeat

		set shift to 0
		set firstAddition to 1
		if playlistId is not "" and (count of additions) > 0 and trackCount > 0 then
			set probeId to (item 1 of additions) as text
			set oldLast to persistent ID of track trackCount of targetPlaylist
			duplicate (first track of library playlist 1 whose persistent ID is probeId) to targetPlaylist
			set newCount to count of tracks of targetPlaylist
			if (persistent ID of track 1 of targetPlaylist is not probeId) or (persistent ID of track newCount of targetPlaylist is not oldLast) then
				if persistent ID of track newCount of targetPlaylist is probeId then delete track newCount of targetPlaylist
				error "Set this playlist to Playlist Order, Descending in Apple Music" number 1
			end if
			set shift to 1
			set firstAddition to 2
		end if

		repeat with removal in removals
			delete track ((item 1 of removal) + shift) of targetPlaylist
		end repeat

		repeat with i from firstAddition to count of additions
			try
				duplicate (first track of library playlist 1 whose persistent ID is ((item i of additions) as text)) to targetPlaylist
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
