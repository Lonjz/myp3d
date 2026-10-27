on run argv
	set trackId to item 1 of argv
	set trackFile to POSIX file (item 2 of argv)

	tell application "Music"
		set matches to (every track of library playlist 1 whose persistent ID is trackId)
		if (count of matches) is 0 then error "Music lost the new copy of the song" number 1
		set location of item 1 of matches to trackFile
	end tell
end run
