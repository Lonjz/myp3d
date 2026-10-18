on run
	set fieldSep to character id 31
	set recSep to character id 30
	set groupSep to character id 29

	tell application "Music"
		tell library playlist 1
			set trackIds to persistent ID of every track
			set trackNames to name of every track
			set trackArtists to artist of every track
			set trackAlbums to album of every track
			set fileIds to persistent ID of every file track
			set fileLocations to location of every file track
		end tell
	end tell

	script o
		property ids : trackIds
		property ns : trackNames
		property ars : trackArtists
		property als : trackAlbums
		property fids : fileIds
		property ls : fileLocations
		property tracksOut : {}
		property locationsOut : {}
	end script

	repeat with i from 1 to count of o's ids
		set end of o's tracksOut to (my textOf(item i of o's ids)) & fieldSep & ¬
			(my textOf(item i of o's ns)) & fieldSep & ¬
			(my textOf(item i of o's ars)) & fieldSep & ¬
			(my textOf(item i of o's als))
	end repeat

	repeat with i from 1 to count of o's fids
		set trackLocation to item i of o's ls
		if trackLocation is not missing value then
			set end of o's locationsOut to (my textOf(item i of o's fids)) & fieldSep & (POSIX path of trackLocation)
		end if
	end repeat

	set AppleScript's text item delimiters to recSep
	set tracksText to o's tracksOut as text
	set locationsText to o's locationsOut as text
	set AppleScript's text item delimiters to ""
	return tracksText & groupSep & locationsText
end run

on textOf(v)
	if v is missing value then return ""
	return v as text
end textOf
