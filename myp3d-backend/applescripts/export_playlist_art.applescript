on run argv
	set playlistId to item 1 of argv
	set outPath to item 2 of argv

	tell application "Music"
		set matches to (every user playlist whose persistent ID is playlistId)
		if (count of matches) is 0 then return "noart"
		try
			set artData to raw data of artwork 1 of (item 1 of matches)
		on error
			return "noart"
		end try
	end tell

	set outFile to open for access (POSIX file outPath) with write permission
	try
		set eof outFile to 0
		write artData to outFile
		close access outFile
	on error errMsg
		close access outFile
		return "noart:" & errMsg
	end try
	return "art"
end run
