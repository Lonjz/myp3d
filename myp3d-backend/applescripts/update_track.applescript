on run argv
	set trackId to item 1 of argv
	set newName to item 2 of argv
	set newArtist to item 3 of argv
	set newAlbum to item 4 of argv
	set artData to missing value
	if (count of argv) > 4 then set artData to read (POSIX file (item 5 of argv)) as JPEG picture

	tell application "Music"
		set matches to (every track of library playlist 1 whose persistent ID is trackId)
		if (count of matches) is 0 then error "That song is no longer in Apple Music" number 1
		set targetTrack to item 1 of matches
		if newName is not "" then set name of targetTrack to newName
		if newArtist is not "" then set artist of targetTrack to newArtist
		if newAlbum is not "" then set album of targetTrack to newAlbum
		set artState to "noart"
		if artData is not missing value then
			try
				set data of artwork 1 of targetTrack to artData
				set artState to "art"
			end try
		end if
		return artState
	end tell
end run
