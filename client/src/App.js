import React, { useEffect, useState } from "react";
import "./App.css";
import Select from "react-select";
import './App.css'
import axios from 'axios'
import cdkExports from './cdk-outputs.json'

const App = () => {
	const [currentMeetings, setCurrentMeetings] = useState([]);
	const [currentMeetingIds, setCurrentMeetingIds] = useState([]);	
	const [selectedMeeting, setSelectedMeeting] = useState('');
	const [selectedAttendee, setSelectedAttendee] = useState('')
	const [selectedUpdate, setSelectedUpdate] = useState('');

	const url = cdkExports.updateCallDemo.updateCallApi
	const headers = {
		Accept: "application/json",
		"Content-Type": "application/json"
	  };

	const handleMeetingSelection = (selectedMeeting) => {
		if (selectedMeeting != null) {
			setSelectedMeeting(selectedMeeting);
			console.log("Selected Meeting: ", selectedMeeting.value);					
		} else {
			setSelectedMeeting('');
		}	
	};

	const handleAttendeeSelection = (selectedAttendee) => {
		if (selectedAttendee != null) {
			setSelectedAttendee(selectedAttendee)
			console.log("Selected Attendee: ", selectedAttendee.label)					
		} else {
			setSelectedAttendee('')
		}
	}

	const handleUpdateSelection = (selectedUpdate) => {
		console.log("Selected Update: ", selectedUpdate.value)
		setSelectedUpdate(selectedUpdate)
	}

	const handleUpdate = async (submitType) => {
		const attendeeInfo = currentMeetings.filter(attendee => attendee.attendeeId === selectedAttendee.value)
		console.log("Updating ", attendeeInfo[0].fromNumber, " with " + selectedUpdate.value + " action using " + submitType)
		const updateRequest = {
			attendeeId: attendeeInfo[0].attendeeId,
			meetingId: attendeeInfo[0].meetingId,
			fromNumber: attendeeInfo[0].fromNumber,
			callId: attendeeInfo[0].callId,
			transactionId: attendeeInfo[0].transactionId,
			updateInfo: selectedUpdate.value
		}
			
		try {
			const updateResponse = await axios.post(
				url + "updateCall" + submitType,				
				updateRequest,
				{ headers }
			);
			console.log(updateResponse.data)
		} catch (error) {
			console.log("Error: ", error)
		}
	};

	const currentMeetingsOptions = currentMeetingIds
	.map((meeting) => {
		const currentMeetingsArray = {}
		currentMeetingsArray.label = meeting
		currentMeetingsArray.value = meeting
		return currentMeetingsArray
	})

	const attendeeOptions = currentMeetings
	.filter(attendees => attendees.meetingId === selectedMeeting.value)
	.map((attendees) => {
		const currentAttendeesArray = {}
		currentAttendeesArray.label = attendees.fromNumber
		currentAttendeesArray.value = attendees.attendeeId

		return currentAttendeesArray
	})

	const updateOptions = [
		{ label: "Mute Attendee", value: "MuteAttendee" },
		{ label: "Unmute Attendee", value: "UnmuteAttendee" },
		{ label: "Play Audio", value: "PlayAudio" },
		{ label: "Disconnect Attendee", value: "DisconnectAttendee" }
	]

	useEffect(() => {
	
		const fetchMeetings = async () => {
			try {
				const meetingResponse = await axios.post(
					url + "queryMeetings",
					{ headers }
				);
				const uniqueMeetings = [...new Set(meetingResponse.data.Items.map(item => item.meetingId))] 
				setCurrentMeetingIds(uniqueMeetings)
				setCurrentMeetings(meetingResponse.data.Items)
			} catch (error) {
				console.log("Error: ", error)
			}
		};
		
		fetchMeetings()
	}, [])

	return(
		<>
			<div className="meetingSelection">
				<label>Select Meeting</label>
				<Select
					value={selectedMeeting}
					onChange={handleMeetingSelection}
					options={currentMeetingsOptions}
					isClearable
				/>
				<div className="attendeeSelection">
					<p></p>
					{selectedMeeting && (
						<div>
							<label>Select Attendee</label>
							<Select
								value={selectedAttendee}
								onChange={handleAttendeeSelection}
								options={attendeeOptions}
								isClearable
							/>
							<div className="updateSelection">
								<p></p>
								{selectedAttendee && (
									<div>
										<form onSubmit={e => e.preventDefault()}>
										<label>Select Update</label>
										<Select
											value={selectedUpdate}
											onChange={handleUpdateSelection}
											options={updateOptions}
											isClearable
										/>
										<p></p>
										<button
											onClick={() => handleUpdate("Node")}
											type="submit"
											name="NodeJSButton"
											value="Node"
										>Submit with NodeJS</button>
										<button
											onClick={() => handleUpdate("Python")}
											type="submit"
											name="PythonButton"
											value="Python"
										>Submit with Python</button>
										</form>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	)
}


export default App

