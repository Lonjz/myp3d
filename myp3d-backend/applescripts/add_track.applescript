on run argv
	set fieldSep to character id 31
	set trackFile to POSIX file (item 1 of argv)
	set artData to missing value
	if (count of argv) > 1 then set artData to read (POSIX file (item 2 of argv)) as JPEG picture

	tell application "Music"
		set newTrack to add trackFile
		if newTrack is missing value then error "Music couldn't add the file" number 1
		set artState to "noart"
		if artData is not missing value then
			try
				set data of artwork 1 of newTrack to artData
				set artState to "art"
			end try
		end if
		return (persistent ID of newTrack) & fieldSep & artState
	end tell
end run
