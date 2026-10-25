on run argv
	set trackId to item 1 of argv

	tell application "Music"
		set matches to (every track of library playlist 1 whose persistent ID is trackId)
		if (count of matches) is 0 then error "That song is no longer in Apple Music" number 1
		refresh item 1 of matches
	end tell
end run
